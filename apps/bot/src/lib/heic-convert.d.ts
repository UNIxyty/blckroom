declare module "heic-convert" {
  interface HeicConvertOptions {
    buffer: ArrayBufferLike;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
