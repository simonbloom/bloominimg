import ImageGridTool from "@/components/image-grid-tool";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Vector Grid Generator</h1>
        <div className="text-sm text-muted-foreground">
          v1.0
        </div>
      </nav>
      <ImageGridTool />
    </main>
  );
}
