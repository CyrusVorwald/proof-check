import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("verify", "routes/verify.tsx"),
  route("batch", "routes/batch.tsx"),
  route("api/extract", "routes/api.extract.ts"),
  route("help", "routes/help.tsx"),
] satisfies RouteConfig;
