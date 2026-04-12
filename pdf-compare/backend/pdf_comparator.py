import fitz  # PyMuPDF
import cv2
import numpy as np
import os
import io
from PIL import Image

def compare_pdfs(pdf1_path, pdf2_path, output_path):
    doc1 = fitz.open(pdf1_path)
    doc2 = fitz.open(pdf2_path)

    num_pages1 = len(doc1)
    num_pages2 = len(doc2)

    out_doc = fitz.open()

    common_pages = min(num_pages1, num_pages2)

    for page_num in range(common_pages):
        page1 = doc1.load_page(page_num)
        page2 = doc2.load_page(page_num)

        # Render pages to images
        pix1 = page1.get_pixmap(dpi=300)
        pix2 = page2.get_pixmap(dpi=300)

        img1 = np.frombuffer(pix1.samples, dtype=np.uint8).reshape(pix1.h, pix1.w, pix1.n)
        img2 = np.frombuffer(pix2.samples, dtype=np.uint8).reshape(pix2.h, pix2.w, pix2.n)

        if pix1.n == 4:
            img1 = cv2.cvtColor(img1, cv2.COLOR_RGBA2RGB)
        if pix2.n == 4:
            img2 = cv2.cvtColor(img2, cv2.COLOR_RGBA2RGB)

        # Ensure images are the same size for comparison
        h1, w1 = img1.shape[:2]
        h2, w2 = img2.shape[:2]

        max_h = max(h1, h2)
        max_w = max(w1, w2)

        img1_padded = np.zeros((max_h, max_w, 3), dtype=np.uint8)
        img1_padded.fill(255)
        img1_padded[:h1, :w1] = img1

        img2_padded = np.zeros((max_h, max_w, 3), dtype=np.uint8)
        img2_padded.fill(255)
        img2_padded[:h2, :w2] = img2

        # Compute difference
        diff = cv2.absdiff(img1_padded, img2_padded)
        gray_diff = cv2.cvtColor(diff, cv2.COLOR_RGB2GRAY)

        _, mask = cv2.threshold(gray_diff, 10, 255, cv2.THRESH_BINARY)

        # Create the resulting image by blending using pure numpy
        result_img = img2_padded.copy()
        alpha = 0.5

        # Only modify pixels where difference exists
        mask_bool = mask == 255

        if np.any(mask_bool):
            # For differing pixels, blend original with pure red [255, 0, 0]
            # using numpy operations to avoid cv2 crashes on empty arrays
            orig_pixels = result_img[mask_bool].astype(float)
            red_pixels = np.array([255, 0, 0], dtype=float)

            blended = orig_pixels * (1 - alpha) + red_pixels * alpha
            result_img[mask_bool] = blended.astype(np.uint8)

        pil_img = Image.fromarray(result_img)
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format='JPEG', quality=95)
        img_bytes = img_byte_arr.getvalue()

        img_pdf = fitz.open("pdf", fitz.open(stream=img_bytes, filetype="jpeg").convert_to_pdf())
        out_doc.insert_pdf(img_pdf)
        img_pdf.close()

    # Handle scenario where second file has MORE pages
    if num_pages2 > num_pages1:
        for page_num in range(num_pages1, num_pages2):
            out_doc.insert_pdf(doc2, from_page=page_num, to_page=page_num)

    out_doc.save(output_path)
    out_doc.close()
    doc1.close()
    doc2.close()

    metadata = {
        "num_pages1": num_pages1,
        "num_pages2": num_pages2,
        "pages_changed": num_pages1 != num_pages2,
        "status": "pages_decreased" if num_pages2 < num_pages1 else "pages_increased" if num_pages2 > num_pages1 else "pages_equal"
    }
    return metadata
