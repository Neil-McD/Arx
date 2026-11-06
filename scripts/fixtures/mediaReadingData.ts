export const pdf = { id: "pdf", name: "Community welcome guide.pdf", type: "file" as const, mime: "application/pdf", size: 1000, url: "https://media.example.test/guide.pdf" };
export const text = "Two things to watch before our next session:\nhttps://youtu.be/jNQXAC9IVRw\nhttps://youtu.be/M7lc1UVf-VE";
export const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, name: `Workshop ${i + 1}`, type: "image" as const, mime: "image/svg+xml", size: 100, url: `https://media.example.test/image-${i}.svg` }));
