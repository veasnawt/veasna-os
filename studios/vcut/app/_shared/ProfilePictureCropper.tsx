"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Close } from "@veasnawt/vicons";
import { profilePictureCrop } from "./profilePictureCrop";

export function ProfilePictureCropper({
  file,
  onCancel,
  onApply,
}: {
  file: File;
  onCancel: () => void;
  onApply: (picture: File) => void;
}) {
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    center: { x: number; y: number };
    side: number;
    size: number;
  } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus({ preventScroll: true });
    const src = URL.createObjectURL(file);
    let active = true;
    const decoded = new Image();
    decoded.onload = () => {
      if (!active) return;
      if (
        !decoded.naturalWidth ||
        !decoded.naturalHeight ||
        decoded.naturalWidth * decoded.naturalHeight > 16777216
      ) {
        setError("Choose a photo with fewer than 16 megapixels.");
        return;
      }
      image.current = decoded;
      setDimensions({
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
      });
    };
    decoded.onerror = () => {
      if (active)
        setError("Couldn't open this photo. Please choose another image.");
    };
    decoded.src = src;
    setUrl(src);
    return () => {
      mounted.current = false;
      active = false;
      image.current = null;
      decoded.src = "";
      URL.revokeObjectURL(src);
    };
  }, [file]);

  const crop = dimensions
    ? profilePictureCrop(dimensions.width, dimensions.height, zoom, center)
    : null;

  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId || !dimensions || busy) return;
    const next = profilePictureCrop(dimensions.width, dimensions.height, zoom, {
      x:
        start.center.x -
        ((event.clientX - start.x) * start.side) /
          (start.size * dimensions.width),
      y:
        start.center.y -
        ((event.clientY - start.y) * start.side) /
          (start.size * dimensions.height),
    });
    setCenter(next.center);
  }

  async function apply() {
    if (!crop || !image.current || busy) return;
    setBusy(true);
    drag.current = null;
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Couldn't crop this photo. Please try again.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 512, 512);
      context.drawImage(
        image.current,
        crop.left,
        crop.top,
        crop.side,
        crop.side,
        0,
        0,
        512,
        512,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(
                  new Error("Couldn't crop this photo. Please try again."),
                ),
          "image/jpeg",
          0.92,
        ),
      );
      if (!mounted.current) return;
      onApply(new File([blob], "profile-picture.jpg", { type: "image/jpeg" }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't crop this photo. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="p-5 sm:p-6" aria-busy={busy}>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2
          ref={heading}
          tabIndex={-1}
          id="profile-picture-crop-title"
          className="text-lg font-semibold outline-none"
        >
          Crop profile picture
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          aria-label="Cancel picture crop"
          className="rounded-lg p-2 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40"
        >
          <Close size={20} aria-hidden="true" />
        </button>
      </div>
      <p
        id="profile-picture-crop-help"
        className="mb-5 text-xs leading-relaxed text-white/50"
      >
        Drag to reposition and zoom to frame your photo. The circle shows how
        your picture will appear.
      </p>
      <div
        tabIndex={0}
        role="group"
        aria-label="Photo crop area"
        aria-describedby="profile-picture-crop-help profile-picture-keyboard-help"
        className="relative mx-auto aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        style={{ cursor: busy ? "wait" : "grab" }}
        onPointerDown={(event) => {
          if (
            !crop ||
            busy ||
            drag.current ||
            (event.pointerType === "mouse" && event.button !== 0)
          )
            return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            center: crop.center,
            side: crop.side,
            size: event.currentTarget.getBoundingClientRect().width,
          };
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (drag.current?.pointer === event.pointerId) {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (
            !crop ||
            !dimensions ||
            busy ||
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          const step = crop.side * (event.shiftKey ? 0.1 : 0.02);
          setCenter(
            profilePictureCrop(dimensions.width, dimensions.height, zoom, {
              x:
                crop.center.x +
                (event.key === "ArrowLeft"
                  ? step
                  : event.key === "ArrowRight"
                    ? -step
                    : 0) /
                  dimensions.width,
              y:
                crop.center.y +
                (event.key === "ArrowUp"
                  ? step
                  : event.key === "ArrowDown"
                    ? -step
                    : 0) /
                  dimensions.height,
            }).center,
          );
        }}
      >
        {url && crop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: `${(dimensions!.width / crop.side) * 100}%`,
              height: `${(dimensions!.height / crop.side) * 100}%`,
              left: `${(-crop.left / crop.side) * 100}%`,
              top: `${(-crop.top / crop.side) * 100}%`,
            }}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs text-white/50"
            role="status"
          >
            {error ? "Photo unavailable" : "Loading photo..."}
          </div>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/85"
          style={{ boxShadow: "0 0 0 160px rgb(0 0 0 / 55%)" }}
        />
      </div>
      <p id="profile-picture-keyboard-help" className="sr-only">
        Use arrow keys to reposition the photo. Hold Shift for larger steps.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <label
          htmlFor="profile-picture-zoom"
          className="text-xs font-medium text-white/65"
        >
          Zoom
        </label>
        <input
          id="profile-picture-zoom"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          disabled={!crop || busy}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (dimensions)
              setCenter(
                profilePictureCrop(
                  dimensions.width,
                  dimensions.height,
                  next,
                  center,
                ).center,
              );
            setZoom(next);
          }}
          className="min-w-0 flex-1 accent-sky-400"
        />
        <output
          htmlFor="profile-picture-zoom"
          className="w-10 text-right text-xs tabular-nums text-white/50"
        >
          {zoom.toFixed(1)}x
        </output>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-xs text-amber-200">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!crop || busy || Boolean(error)}
          className="btn-brand-gradient rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "Cropping..." : "Use photo"}
        </button>
      </div>
    </div>
  );
}
