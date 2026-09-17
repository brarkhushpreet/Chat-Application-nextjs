"use client"

import { FileIcon, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

interface FileUploadProps{
    onChange:(url? : string)=>void;
    value?:string;
    endpoint:"messageFile" | "serverImage"
}
export const FileUpload=({onChange,value,endpoint}:FileUploadProps)=>{
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const upload = async (file?: File) => {
        if (!file || busy) return;
        if (file.size > 8 * 1024 * 1024) { setError("Maximum file size is 8 MB"); return; }
        setBusy(true); setError(null);
        try {
            const response = await fetch(`/api/uploads?purpose=${endpoint}`, { method: "POST", body: file });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Upload failed");
            onChange(result.url);
        } catch (err) { setError(err instanceof Error ? err.message : "Upload failed. Please retry."); }
        finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
    };
    const fileType=value?.split(".").pop();
    if(value && fileType!=="pdf"){

        return (
            <div className="relative h-20 w-20">
                <Image
                unoptimized
                 fill
                 src={value}
                 alt="Upload"
                 className="rounded-full"
                />
                <button 
                onClick={()=> onChange("")}
                className="bg-rose-500 text-white p-1 rounded-full absolute top-0 right-0 shadow-sm"
                type="button"
                >
                    <X className="h-4 w-4"/>
                </button>
            </div>
        )
    }

    if (value && fileType === "pdf") {
        return (
          <div className="relative flex items-center p-2 mt-2 rounded-md bg-background/10">
            <FileIcon className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
            <a 
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
            >
              {value}
            </a>
            <button
              onClick={() => onChange("")}
              className="bg-rose-500 text-white p-1 rounded-full absolute -top-2 -right-2 shadow-sm"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      }
    
    const isServerImage = endpoint === "serverImage";

    return (
        <div className={isServerImage ? "w-full" : undefined}>
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}
                className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-foreground transition hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
                <Upload className="h-7 w-7 text-primary" />
                <span>{busy ? "Uploading…" : "Drop a file or browse"}</span>
                <span className="text-xs text-muted-foreground">{isServerImage ? "Optional · PNG, JPG, GIF or WebP" : "Image or PDF"} · up to 8 MB</span>
            </button>
            <input ref={inputRef} type="file" hidden accept={isServerImage ? "image/png,image/jpeg,image/gif,image/webp" : "image/png,image/jpeg,image/gif,image/webp,application/pdf"}
                onChange={event => void upload(event.target.files?.[0])} />
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
    )
}
