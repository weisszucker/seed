import { promises as fs } from "fs";
import path from "path";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export async function buildFileTree(dirPath: string): Promise<FileNode> {
  const stat = await fs.stat(dirPath);
  const name = path.basename(dirPath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: FileNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // Skip hidden files
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        children.push(await buildFileTree(fullPath));
      } else {
        children.push({
          name: entry.name,
          path: fullPath,
          type: "file",
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    children.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });

    return {
      name,
      path: dirPath,
      type: "directory",
      children,
    };
  }

  return {
    name,
    path: dirPath,
    type: "file",
  };
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getFileExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function isMarkdownFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ext === ".md" || ext === ".markdown";
}