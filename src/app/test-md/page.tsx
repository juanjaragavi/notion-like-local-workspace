"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Page() {
  const content = "Here is some text:\n\n* **TopJobs**\n\nHope this helps!";

  return (
    <div className="p-8 bg-neutral-900 text-white min-h-screen">
      <h1>Plain:</h1>
      <pre>{content}</pre>

      <h1 className="mt-8">ReactMarkdown:</h1>
      <div className="prose prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
