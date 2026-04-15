use tauri::command;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use pdf_writer::{Pdf, Content, Name, Rect, Filter, Finish};

#[derive(Serialize, Deserialize)]
pub struct CompareResult {
    pub success: bool,
    pub message: String,
    pub output_path: String,
}

#[derive(Deserialize)]
pub struct DiffPage {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[command]
async fn create_pdf(file2_path: String, pages: Vec<DiffPage>) -> Result<CompareResult, String> {
    let mut pdf = Pdf::new();
    let mut alloc = pdf_writer::Ref::new(1);

    let catalog_id = alloc; alloc.bump();
    let pages_id = alloc; alloc.bump();

    pdf.catalog(catalog_id).pages(pages_id);
    let mut page_ids = Vec::new();

    for (i, page_data) in pages.iter().enumerate() {
        // Here we receive raw RGBA pixel data from the frontend (canvas).
        // Convert to RGB for PDF DeviceRGB
        let mut rgb_data = Vec::with_capacity((page_data.width * page_data.height * 3) as usize);
        for chunk in page_data.data.chunks_exact(4) {
            // blend with white background just in case alpha is not 255
            let a = chunk[3] as f32 / 255.0;
            let r = (chunk[0] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let g = (chunk[1] as f32 * a + 255.0 * (1.0 - a)) as u8;
            let b = (chunk[2] as f32 * a + 255.0 * (1.0 - a)) as u8;
            rgb_data.push(r);
            rgb_data.push(g);
            rgb_data.push(b);
        }

        // Encode this RGB page losslessly using Zlib/Flate
        let mut compressed_data = Vec::new();
        {
            let mut encoder = ZlibEncoder::new(&mut compressed_data, Compression::best());
            encoder.write_all(&rgb_data).map_err(|e| format!("Zlib encode error: {:?}", e))?;
        }

        let page_id = alloc; alloc.bump();
        page_ids.push(page_id);

        let img_name_str = format!("Im{}", i);
        let image_name = Name(img_name_str.as_bytes());
        let image_id = alloc; alloc.bump();

        let width = page_data.width as f32;
        let height = page_data.height as f32;

        let mut page = pdf.page(page_id);
        page.media_box(Rect::new(0.0, 0.0, width, height));
        page.parent(pages_id);

        let content_id = alloc; alloc.bump();
        page.contents(content_id);
        page.resources().x_objects().pair(image_name, image_id);
        page.finish();

        let mut content = Content::new();
        content.save_state();
        content.transform([width, 0.0, 0.0, height, 0.0, 0.0]);
        content.x_object(image_name);
        content.restore_state();
        pdf.stream(content_id, &content.finish());

        let mut image_stream = pdf.image_xobject(image_id, &compressed_data);
        image_stream.width(page_data.width as i32);
        image_stream.height(page_data.height as i32);
        image_stream.color_space().device_rgb();
        image_stream.bits_per_component(8);
        image_stream.filter(Filter::FlateDecode);
        image_stream.finish();
    }

    pdf.pages(pages_id)
        .count(page_ids.len() as i32)
        .kids(page_ids.into_iter());

    let final_output = format!("{}_diff_result.pdf", file2_path);
    let mut file = File::create(&final_output).map_err(|e| e.to_string())?;
    file.write_all(&pdf.finish()).map_err(|e| e.to_string())?;

    Ok(CompareResult {
        success: true,
        message: "Сравнение завершено. Создан общий PDF файл с результатами.".to_string(),
        output_path: final_output
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![create_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
