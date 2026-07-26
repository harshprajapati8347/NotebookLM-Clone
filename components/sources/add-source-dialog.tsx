"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileText, Link2, Subtitles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SourceSummary } from "@/lib/sources/types";

type TabKey = "pdf" | "text" | "url" | "youtube" | "vtt";

async function registerSource(
  notebookId: string,
  body: FormData | Record<string, unknown>
): Promise<SourceSummary> {
  const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
    method: "POST",
    ...(body instanceof FormData
      ? { body }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to add source");
  }
  return data.source as SourceSummary;
}

export function AddSourceDialog({
  notebookId,
  open,
  onOpenChange,
  onAdded,
}: {
  notebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (source: SourceSummary) => void;
}) {
  const [tab, setTab] = React.useState<TabKey>("pdf");
  const [submitting, setSubmitting] = React.useState(false);

  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [pastedTitle, setPastedTitle] = React.useState("");
  const [pastedText, setPastedText] = React.useState("");
  const [urlTitle, setUrlTitle] = React.useState("");
  const [urlValue, setUrlValue] = React.useState("");
  const [youtubeTitle, setYoutubeTitle] = React.useState("");
  const [youtubeValue, setYoutubeValue] = React.useState("");
  const [vttFile, setVttFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (open) {
      setTab("pdf");
      setPdfFile(null);
      setPastedTitle("");
      setPastedText("");
      setUrlTitle("");
      setUrlValue("");
      setYoutubeTitle("");
      setYoutubeValue("");
      setVttFile(null);
    }
  }, [open]);

  async function submit(fn: () => Promise<SourceSummary>) {
    setSubmitting(true);
    try {
      const source = await fn();
      onAdded(source);
      onOpenChange(false);
      toast.success(`"${source.title}" queued for ingestion`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add source");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (tab === "pdf") {
      if (!pdfFile) return toast.error("Choose a PDF file");
      const form = new FormData();
      form.set("type", "PDF");
      form.set("file", pdfFile);
      submit(() => registerSource(notebookId, form));
    } else if (tab === "text") {
      if (!pastedText.trim()) return toast.error("Paste some text");
      submit(() =>
        registerSource(notebookId, { type: "TEXT", pastedText, title: pastedTitle })
      );
    } else if (tab === "url") {
      if (!urlValue.trim()) return toast.error("Enter a URL");
      submit(() => registerSource(notebookId, { type: "URL", originUrl: urlValue, title: urlTitle }));
    } else if (tab === "youtube") {
      if (!youtubeValue.trim()) return toast.error("Enter a YouTube URL");
      submit(() =>
        registerSource(notebookId, { type: "YOUTUBE", originUrl: youtubeValue, title: youtubeTitle })
      );
    } else if (tab === "vtt") {
      if (!vttFile) return toast.error("Choose a .vtt or .srt file");
      const form = new FormData();
      form.set("type", "VTT");
      form.set("file", vttFile);
      submit(() => registerSource(notebookId, form));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add source</DialogTitle>
            <DialogDescription>
              Add a PDF, pasted text, a website URL, a YouTube video, or a transcript file.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="py-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="pdf" title="PDF">
                <FileText />
              </TabsTrigger>
              <TabsTrigger value="text" title="Paste text">
                <FileText />
              </TabsTrigger>
              <TabsTrigger value="url" title="Website URL">
                <Link2 />
              </TabsTrigger>
              <TabsTrigger value="youtube" title="YouTube">
                <Video />
              </TabsTrigger>
              <TabsTrigger value="vtt" title="Transcript">
                <Subtitles />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pdf" className="flex flex-col gap-1.5">
              <Label htmlFor="pdf-file">PDF file</Label>
              <Input
                id="pdf-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </TabsContent>

            <TabsContent value="text" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="text-title">Title <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="text-title"
                  placeholder="e.g. Meeting notes"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="text-content">Text</Label>
                <Textarea
                  id="text-content"
                  placeholder="Paste your text here…"
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="url" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="url-title">Title <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="url-title"
                  placeholder="e.g. Article on RAG"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="url-value">Website URL</Label>
                <Input
                  id="url-value"
                  placeholder="https://example.com/article"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="youtube" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="youtube-title">Title <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="youtube-title"
                  placeholder="e.g. Lecture 3"
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="youtube-value">YouTube URL</Label>
                <Input
                  id="youtube-value"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={youtubeValue}
                  onChange={(e) => setYoutubeValue(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="vtt" className="flex flex-col gap-1.5">
              <Label htmlFor="vtt-file">Transcript file (.vtt or .srt)</Label>
              <Input
                id="vtt-file"
                type="file"
                accept=".vtt,.srt,text/vtt"
                onChange={(e) => setVttFile(e.target.files?.[0] ?? null)}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
