import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Section-based PDF export that prevents content from being cut across pages.
 * 
 * How it works:
 * 1. Clones the print element off-screen at A4 width
 * 2. Finds all direct children marked with data-pdf-section (or all direct children)
 * 3. Captures each section individually with html2canvas
 * 4. Places sections on PDF pages, adding a new page when a section won't fit
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2;
const SECTION_GAP_MM = 0;

interface PdfMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface SectionBasedPdfOptions {
  element: HTMLElement;
  filename: string;
  onProgress?: (progress: number) => void;
  backgroundImage?: string;
  margins?: PdfMargins;
}

export async function exportSectionBasedPdf({
  element,
  filename,
  onProgress,
  backgroundImage,
}: SectionBasedPdfOptions): Promise<void> {
  const progress = (v: number) => onProgress?.(v);

  progress(10);

  // Clone element off-screen at A4 width
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = `${A4_WIDTH_MM}mm`;
  clone.style.backgroundColor = "#ffffff";
  clone.style.padding = `${MARGIN_MM}mm`;
  clone.style.boxSizing = "border-box";
  // Remove any minHeight that forces extra whitespace
  clone.style.minHeight = "auto";
  document.body.appendChild(clone);

  // Strip background image from clone so html2canvas captures clean white content
  if (backgroundImage) {
    const root = clone.querySelector("[data-pdf-root]") as HTMLElement;
    if (root) {
      root.style.backgroundImage = "none";
    }
  }

  // Wait for render
  await new Promise((r) => setTimeout(r, 300));
  progress(15);

  // Ensure all images are loaded
  const images = clone.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve(null);
          else {
            img.onload = () => resolve(null);
            img.onerror = () => resolve(null);
          }
        })
    )
  );
  progress(20);

  // Find the inner content wrapper (the div with padding that holds all sections)
  // This is the first child div that contains all the actual content sections
  const contentWrapper = clone.querySelector("[data-pdf-root]") as HTMLElement || clone.firstElementChild as HTMLElement;
  
  if (!contentWrapper) {
    document.body.removeChild(clone);
    throw new Error("No content found for PDF export");
  }

  // Get all direct children of the content wrapper as sections
  const sections = Array.from(contentWrapper.children) as HTMLElement[];

  if (sections.length === 0) {
    document.body.removeChild(clone);
    throw new Error("No sections found for PDF export");
  }

  progress(25);

  // Capture each section individually
  const html2canvasOptions = {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: backgroundImage ? null : "#ffffff", // transparent when using bg image
    imageTimeout: 15000,
  };

  // Get the pixel-to-mm conversion factor from the clone
  // The clone is set to A4_WIDTH_MM wide, so we can measure its pixel width
  const clonePixelWidth = contentWrapper.offsetWidth;
  const pxPerMm = clonePixelWidth / CONTENT_WIDTH_MM;

  interface CapturedSection {
    canvas: HTMLCanvasElement;
    heightMM: number;
  }

  const capturedSections: CapturedSection[] = [];
  const totalSections = sections.length;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    // Skip invisible/empty sections
    if (section.offsetHeight === 0) continue;

    const canvas = await html2canvas(section, {
      ...html2canvasOptions,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll("img").forEach((img) => {
          img.setAttribute("crossorigin", "anonymous");
        });
      },
    });

    if (canvas && canvas.width > 0 && canvas.height > 0) {
      // Calculate height in mm based on actual pixel dimensions and scale factor
      const scaledWidth = canvas.width / 2; // scale: 2
      const scaledHeight = canvas.height / 2;
      const heightMM = (scaledHeight / scaledWidth) * CONTENT_WIDTH_MM;

      capturedSections.push({ canvas, heightMM });
    }

    progress(25 + Math.round((i / totalSections) * 40)); // 25-65%
  }

  // Remove clone
  document.body.removeChild(clone);

  if (capturedSections.length === 0) {
    throw new Error("Failed to capture any sections");
  }

  progress(65);

  // Check which sections are marked as bottom-anchored
  const sectionElements = sections.filter(s => s.offsetHeight > 0);
  const bottomFlags: boolean[] = [];
  let flagIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].offsetHeight === 0) continue;
    bottomFlags.push(sections[i].hasAttribute("data-pdf-bottom"));
    flagIdx++;
  }

  // Load background image if provided
  let bgImgData: string | null = null;
  if (backgroundImage) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load background image"));
        img.src = backgroundImage;
      });
      const bgCanvas = document.createElement("canvas");
      bgCanvas.width = img.naturalWidth;
      bgCanvas.height = img.naturalHeight;
      const ctx = bgCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        bgImgData = bgCanvas.toDataURL("image/jpeg", 0.92);
      }
    } catch (e) {
      console.warn("Could not load PDF background image:", e);
    }
  }

  // Build PDF with smart page breaks
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Helper to add background to current page
  const addPageBg = () => {
    if (bgImgData) {
      pdf.addImage(bgImgData, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }
  };

  // Add background to first page
  addPageBg();

  let currentY = MARGIN_MM;

  for (let i = 0; i < capturedSections.length; i++) {
    const { canvas, heightMM } = capturedSections[i];
    const isBottom = bottomFlags[i] || false;
    const remainingSpace = A4_HEIGHT_MM - MARGIN_MM - currentY;

    // If this is a bottom-anchored section, push it to the bottom of the current page
    if (isBottom) {
      const bottomY = A4_HEIGHT_MM - MARGIN_MM - heightMM;
      if (bottomY > currentY) {
        currentY = bottomY;
      }
    }

    // If section won't fit (with 3mm safety buffer) and we're not at the top of a new page, add new page
    const spaceLeft = A4_HEIGHT_MM - MARGIN_MM - currentY;
    if (heightMM > spaceLeft - 3 && currentY > MARGIN_MM + 1) {
      pdf.addPage();
      addPageBg();
      currentY = MARGIN_MM;
      if (isBottom) {
        const bottomY = A4_HEIGHT_MM - MARGIN_MM - heightMM;
        if (bottomY > currentY) currentY = bottomY;
      }
    }

    // If a single section is taller than the page content area,
    // we need to split it across pages (fallback for very large tables)
    if (heightMM > CONTENT_HEIGHT_MM) {
      // For oversized sections, use the old slicing approach
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      let sectionRemainingHeight = heightMM;
      let yOffset = 0;

      while (sectionRemainingHeight > 0) {
        if (yOffset > 0) {
          pdf.addPage();
          addPageBg();
          currentY = MARGIN_MM;
        }

        const availableHeight = A4_HEIGHT_MM - MARGIN_MM - currentY;
        const drawHeight = Math.min(sectionRemainingHeight, availableHeight);

        // Calculate source rectangle for this page slice
        const sourceY = (yOffset / heightMM) * canvas.height;
        const sourceHeight = (drawHeight / heightMM) * canvas.height;

        // Create a temporary canvas for this slice
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.round(sourceHeight);
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, Math.round(sourceY),
            canvas.width, Math.round(sourceHeight),
            0, 0,
            canvas.width, Math.round(sourceHeight)
          );

          const fmt = backgroundImage ? "PNG" : "JPEG";
          const sliceData = backgroundImage ? sliceCanvas.toDataURL("image/png") : sliceCanvas.toDataURL("image/jpeg", 0.92);
          pdf.addImage(sliceData, fmt, MARGIN_MM, currentY, CONTENT_WIDTH_MM, drawHeight);
        }

        yOffset += drawHeight;
        sectionRemainingHeight -= drawHeight;
        currentY += drawHeight;
      }
    } else {
      // Normal case: section fits on a page
      const fmt = backgroundImage ? "PNG" : "JPEG";
      const imgData = backgroundImage ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(imgData, fmt, MARGIN_MM, currentY, CONTENT_WIDTH_MM, heightMM);
      currentY += heightMM + SECTION_GAP_MM;
    }

    progress(65 + Math.round((i / capturedSections.length) * 25)); // 65-90%
  }

  progress(90);

  pdf.save(filename);

  progress(100);
  await new Promise((r) => setTimeout(r, 300));
}
