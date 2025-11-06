const fs = require("fs");
const path = require("path");

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  // Solo agrega .js si NO tiene ya extensión ni termina en .json/.node
  content = content.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g,
    (match, p1, p2, p3) => {
      if (p2.endsWith(".js") || p2.endsWith(".json") || p2.endsWith(".node")) return match;
      return `${p1}${p2}.js${p3}`;
    }
  );
  fs.writeFileSync(filePath, content, "utf8");
}

function walkDir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (/\.(ts|js)$/.test(f)) {
      fixImportsInFile(fullPath);
    }
  }
}

// Cambia '.' por 'src' si solo quieres afectar esa carpeta
walkDir(".");
console.log("✔ Todos los imports locales ahora terminan en .js");