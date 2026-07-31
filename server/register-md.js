import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderUrl = pathToFileURL(path.join(__dirname, "md-loader.js")).href;

register(loaderUrl);
