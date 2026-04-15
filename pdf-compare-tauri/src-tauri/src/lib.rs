use tauri::command;
use serde::{Deserialize, Serialize};
use pdfium_render::prelude::*;
use std::cmp;
use std::fs::File;
use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use pdf_writer::{Pdf, Content, Name, Rect, Filter, Finish};

#[derive(Serialize, Deserialize)]
pub struct CompareResult {
    pub success: bool,
    pub message: String,
    pub metadata: Option<Metadata>,
    pub output_path: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Metadata {
    pub num_pages1: u32,
    pub num_pages2: u32,
    pub pages_changed: bool,
    pub status: String,
}

#[command]
async fn compare_pdfs(file1: String, file2: String) -> Result<CompareResult, String> {
    // We downloaded the specific pdfium DLL from nuget that contains V8 and all required exports.
    // In pdfium-render v0.8.28, `Pdfium::new` works directly.
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("Failed to load pdfium. Убедитесь, что pdfium.dll находится в папке src-tauri. Ошибка: {:?}", e))?;

    let pdfium = Pdfium::new(bindings);

    let doc1 = pdfium.load_pdf_from_file(&file1, None).map_err(|e| e.to_string())?;
    let doc2 = pdfium.load_pdf_from_file(&file2, None).map_err(|e| e.to_string())?;

    let num_pages1 = doc1.pages().len() as u32;
    let num_pages2 = doc2.pages().len() as u32;

    let common_pages = cmp::min(num_pages1, num_pages2);

    let mut pdf = Pdf::new();
    let mut alloc = pdf_writer::Ref::new(1);

    let catalog_id = alloc; alloc.bump();
    let pages_id = alloc; alloc.bump();

    pdf.catalog(catalog_id).pages(pages_id);
    let mut page_ids = Vec::new();

    // To make sure things don't get too bloated in memory, we save
    // jpeg encodings per page directly into the PDF.
    // NOTE: JPEG requires RGB, not RGBA. So we convert our blended image back to RGB.
    for page_index in 0..common_pages {
        let page1 = doc1.pages().get((page_index as u16).into()).unwrap();
        let page2 = doc2.pages().get((page_index as u16).into()).unwrap();

        // Увеличиваем разрешение до формата A3 (при 300 DPI ширина A3 равна 3508px,
        // но для гарантированной четкости при сильном увеличении мы используем 4960px).
        let render_config = PdfRenderConfig::new().set_target_width(4960);

        let bitmap1 = page1.render_with_config(&render_config).map_err(|e| e.to_string())?;
        let bitmap2 = page2.render_with_config(&render_config).map_err(|e| e.to_string())?;

        let img1 = bitmap1.as_image().into_rgba8();
        let img2 = bitmap2.as_image().into_rgba8();

        let w1 = img1.width();
        let h1 = img1.height();
        let w2 = img2.width();
        let h2 = img2.height();

        let max_w = cmp::max(w1, w2);
        let max_h = cmp::max(h1, h2);

        // JPEG requires RGB, not RGBA
        let mut blended_img = image::ImageBuffer::from_pixel(max_w, max_h, image::Rgb([255, 255, 255]));

        for y in 0..max_h {
            for x in 0..max_w {
                let p1 = if x < w1 && y < h1 { img1.get_pixel(x, y).0 } else { [255, 255, 255, 255] };
                let p2 = if x < w2 && y < h2 { img2.get_pixel(x, y).0 } else { [255, 255, 255, 255] };

                let g1 = (p1[0] as i32 + p1[1] as i32 + p1[2] as i32) / 3;
                let g2 = (p2[0] as i32 + p2[1] as i32 + p2[2] as i32) / 3;

                if (g1 - g2).abs() > 10 {
                    // Blend pure red with the base image p2
                    blended_img.put_pixel(x, y, image::Rgb([
                        (p2[0] as f32 * 0.5 + 255.0 * 0.5) as u8,
                        (p2[1] as f32 * 0.5 + 0.0) as u8,
                        (p2[2] as f32 * 0.5 + 0.0) as u8,
                    ]));
                } else {
                    blended_img.put_pixel(x, y, image::Rgb([p2[0], p2[1], p2[2]]));
                }
            }
        }

        // Encode this page losslessly using Zlib/Flate (like PNG internals)
        // This avoids any JPEG artifacts (blurring, color bleeding on the red highlights).
        let mut compressed_data = Vec::new();
        {
            let mut encoder = ZlibEncoder::new(&mut compressed_data, Compression::best());
            // Get raw RGB pixels
            encoder.write_all(blended_img.as_raw()).map_err(|e| format!("Zlib encode error: {:?}", e))?;
        }

        // Write page and image to the PDF using `pdf-writer`
        let page_id = alloc; alloc.bump();
        page_ids.push(page_id);

        let image_name = Name(b"Im1");
        let image_id = alloc; alloc.bump();

        // Convert pixels to PDF points (A3 = approx 842 x 1190 points)
        // Here we just use the raw dimensions, scaled by some DPI logic if we wanted.
        // For simplicity we will output the page matching the pixel dimensions,
        // which makes it very large but perfectly high-res in viewers.
        let width = max_w as f32;
        let height = max_h as f32;

        let mut page = pdf.page(page_id);
        page.media_box(Rect::new(0.0, 0.0, width, height));
        page.parent(pages_id);

        let content_id = alloc; alloc.bump();
        page.contents(content_id);
        page.resources().x_objects().pair(image_name, image_id);
        page.finish();

        // Scale and draw the image to fill the page
        let mut content = Content::new();
        content.save_state();
        // PDF coordinates start from bottom left, so we transform
        content.transform([width, 0.0, 0.0, height, 0.0, 0.0]);
        content.x_object(image_name);
        content.restore_state();
        pdf.stream(content_id, &content.finish());

        // Embed the Raw compressed image
        let mut image_stream = pdf.image_xobject(image_id, &compressed_data);
        image_stream.width(max_w as i32);
        image_stream.height(max_h as i32);
        image_stream.color_space().device_rgb();
        image_stream.bits_per_component(8);
        // FlateDecode guarantees perfect lossless rendering without jpeg artifacts!
        image_stream.filter(Filter::FlateDecode);
        image_stream.finish();
    }

    // Add all pages to the catalog
    pdf.pages(pages_id)
        .count(page_ids.len() as i32)
        .kids(page_ids.into_iter());

    let status = if num_pages2 < num_pages1 {
        "pages_decreased"
    } else if num_pages2 > num_pages1 {
        "pages_increased"
    } else {
        "pages_equal"
    };

    let final_output = format!("{}_diff_result.pdf", file2);
    let mut file = File::create(&final_output).map_err(|e| e.to_string())?;
    file.write_all(&pdf.finish()).map_err(|e| e.to_string())?;

    Ok(CompareResult {
        success: true,
        message: "Сравнение завершено. Создан общий PDF файл с результатами.".to_string(),
        metadata: Some(Metadata {
            num_pages1,
            num_pages2,
            pages_changed: num_pages1 != num_pages2,
            status: status.to_string(),
        }),
        output_path: Some(final_output)
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![compare_pdfs])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
