import { routeRequest } from "./api";
import { runScheduledIngestion } from "./scheduler";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await routeRequest(request, env); }
    catch (error) {
      if (error instanceof Response) return error;
      console.error(JSON.stringify({ message: "analytics connector request failed", errorType: error instanceof Error ? error.name : "Error", path: new URL(request.url).pathname }));
      return Response.json({ error: "Automatic analytics is temporarily unavailable.", code: "internal_error" }, { status: 503 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledIngestion(env).catch(error => {
      console.error(JSON.stringify({ message: "analytics ingestion schedule failed", errorType: error instanceof Error ? error.name : "Error" }));
    }));
  },
} satisfies ExportedHandler<Env>;
