/**
 * Module d'extraction récursive de dossiers et fichiers depuis l'événement Drag & Drop
 */

export interface ExtractedFile {
  file: File;
  relativePath: string;
}

export async function extractFilesFromDataTransfer(
  items: DataTransferItemList | FileList | File[]
): Promise<ExtractedFile[]> {
  const result: ExtractedFile[] = [];

  // Cas où ce sont des éléments DataTransferItemList (support de l'API webkitGetAsEntry pour dossiers)
  if ('length' in items && items.length > 0 && 'webkitGetAsEntry' in items[0]) {
    const entriesList: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as DataTransferItem;
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entriesList.push(entry);
      }
    }

    for (const entry of entriesList) {
      const files = await readEntryRecursively(entry, '');
      result.push(...files);
    }

    return result;
  }

  // Cas repli direct : liste de fichiers plats
  const fileArray = Array.from(items as FileList | File[]);
  for (const f of fileArray) {
    if (f instanceof File) {
      result.push({
        file: f,
        relativePath: (f as any).webkitRelativePath || f.name,
      });
    }
  }

  return result;
}

async function readEntryRecursively(entry: any, pathSoFar: string): Promise<ExtractedFile[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file: File) => {
          const currentPath = pathSoFar ? `${pathSoFar}/${file.name}` : file.name;
          resolve([{ file, relativePath: currentPath }]);
        },
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const currentPath = pathSoFar ? `${pathSoFar}/${entry.name}` : entry.name;
      const dirReader = entry.createReader();
      const allEntries: any[] = [];

      const readEntries = () => {
        dirReader.readEntries(
          async (entries: any[]) => {
            if (entries.length === 0) {
              const subResults: ExtractedFile[] = [];
              for (const e of allEntries) {
                const subFiles = await readEntryRecursively(e, currentPath);
                subResults.push(...subFiles);
              }
              resolve(subResults);
            } else {
              allEntries.push(...entries);
              readEntries();
            }
          },
          () => resolve([])
        );
      };

      readEntries();
    } else {
      resolve([]);
    }
  });
}
