// Copia solo lo necesario para publicar en internet dentro de ./site
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

if (!existsSync("dist/app.js")) throw new Error("Primero ejecuta: npm run build");
rmSync("site", { recursive: true, force: true });
mkdirSync("site/dist", { recursive: true });
cpSync("index.html", "site/index.html");
cpSync("styles.css", "site/styles.css");
cpSync("dist/app.js", "site/dist/app.js");
writeFileSync("site/.nojekyll", "");
console.log("Sitio listo en ./site");
