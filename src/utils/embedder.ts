import { pipeline } from "@xenova/transformers";

class Embedder {
  static instance: any = null;

  static async getModel() {
    if (!this.instance) {
      // This downloads a small (80MB) model to your machine
      this.instance = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );
    }
    return this.instance;
  }

  static async generate(text: string): Promise<number[]> {
    const generateEmbedding = await this.getModel();
    const output = await generateEmbedding(text, {
      pooling: "mean",
      normalize: true,
    });

    // Convert the output to a standard array of numbers
    return Array.from(output.data);
  }
}

export default Embedder;
