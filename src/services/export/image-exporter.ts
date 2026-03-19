/**
 * Image exporter — generates shareable images from charts and dashboards.
 */

export interface ImageExportConfig {
  /** CSS selector of the element to capture */
  selector?: string;
  /** HTML element reference */
  element?: HTMLElement;
  width?: number;
  height?: number;
  format: 'png' | 'jpeg' | 'svg';
  quality?: number;
  /** Background color */
  backgroundColor?: string;
}

export class ImageExporter {
  /** Export a DOM element to an image */
  async exportElement(config: ImageExportConfig): Promise<Blob> {
    // html-to-image library will be used here
    // This is a client-side operation
    const { toPng, toJpeg, toSvg } = await import('html-to-image');

    if (!config.element && !config.selector) {
      throw new Error('Either element or selector must be provided');
    }

    const element = config.element ?? document.querySelector(config.selector!) as HTMLElement;
    if (!element) throw new Error(`Element not found: ${config.selector}`);

    const options = {
      width: config.width,
      height: config.height,
      backgroundColor: config.backgroundColor ?? '#1a1a2e',
      quality: config.quality ?? 0.95,
    };

    let dataUrl: string;
    switch (config.format) {
      case 'jpeg':
        dataUrl = await toJpeg(element, options);
        break;
      case 'svg':
        dataUrl = await toSvg(element, options);
        break;
      default:
        dataUrl = await toPng(element, options);
    }

    const response = await fetch(dataUrl);
    return response.blob();
  }

  /** Download an image to the user's device */
  async download(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}

export const imageExporter = new ImageExporter();
