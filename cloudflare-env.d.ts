declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI?: {
      run(model: string, input: Record<string, unknown>): Promise<unknown>;
    };
  }
}
