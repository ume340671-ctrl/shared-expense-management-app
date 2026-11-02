import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_SIZE,
  photoPathFor,
  validatePhotoFile,
} from "@/lib/photoStorage";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("validatePhotoFile", () => {
  it("accepte JPG, PNG et WEBP", () => {
    expect(validatePhotoFile(makeFile("photo.jpg", "image/jpeg", 1024))).toBeNull();
    expect(validatePhotoFile(makeFile("photo.jpeg", "image/jpeg", 1024))).toBeNull();
    expect(validatePhotoFile(makeFile("photo.png", "image/png", 1024))).toBeNull();
    expect(validatePhotoFile(makeFile("photo.webp", "image/webp", 1024))).toBeNull();
  });

  it("refuse les formats non pris en charge", () => {
    expect(validatePhotoFile(makeFile("doc.pdf", "application/pdf", 1024))).toContain(
      "Format non pris en charge",
    );
    expect(validatePhotoFile(makeFile("video.mp4", "video/mp4", 1024))).toContain(
      "Format non pris en charge",
    );
  });

  it("refuse les fichiers de plus de 5 Mo", () => {
    const tooBig = makeFile("photo.jpg", "image/jpeg", MAX_PHOTO_SIZE + 1);
    expect(validatePhotoFile(tooBig)).toContain("5 Mo maximum");
  });

  it("accepte un fichier de exactement 5 Mo", () => {
    expect(validatePhotoFile(makeFile("photo.jpg", "image/jpeg", MAX_PHOTO_SIZE))).toBeNull();
  });

  it("refuse un fichier vide", () => {
    expect(validatePhotoFile(makeFile("photo.jpg", "image/jpeg", 0))).toContain("vide");
  });

  it("se rabat sur l'extension si le type MIME est absent", () => {
    expect(validatePhotoFile(makeFile("photo.png", "", 1024))).toBeNull();
    expect(validatePhotoFile(makeFile("doc.txt", "", 1024))).toContain(
      "Format non pris en charge",
    );
  });
});

describe("photoPathFor", () => {
  it("range la photo dans le dossier de son achat", () => {
    const path = photoPathFor("achat-123", "Photo.JPG");
    expect(path.startsWith("purchases/achat-123/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
  });

  it("normalise les extensions inconnues", () => {
    expect(photoPathFor("id", "fichier.exe").endsWith(".jpg")).toBe(true);
  });

  it("génère des chemins uniques", () => {
    expect(photoPathFor("id", "a.jpg")).not.toBe(photoPathFor("id", "a.jpg"));
  });
});
