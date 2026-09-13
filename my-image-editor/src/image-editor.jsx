import { useState, useRef, useCallback, useEffect } from "react";

// ─── GB7 Codec ───────────────────────────────────────────────────────────────

const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1D];

function decodeGB7(buffer) {
  const bytes = new Uint8Array(buffer);
  // Validate signature
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== GB7_SIGNATURE[i]) throw new Error("Invalid GB7 signature");
  }
  const version = bytes[4];
  if (version !== 0x01) throw new Error(`Unsupported GB7 version: ${version}`);
  const flagByte = bytes[5];
  const hasMask = (flagByte & 0x01) === 1;
  const width = (bytes[6] << 8) | bytes[7];
  const height = (bytes[8] << 8) | bytes[9];
  // bytes[10], bytes[11] reserved
  const pixelCount = width * height;
  if (bytes.length < 12 + pixelCount) throw new Error("GB7 file truncated");

  const imageData = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const byte = bytes[12 + i];
    const gray7 = byte & 0x7F; // bits 6-0
    const maskBit = (byte >> 7) & 0x01; // bit 7
    // Scale 7-bit (0-127) to 8-bit (0-255)
    const gray8 = Math.round((gray7 / 127) * 255);
    const alpha = hasMask ? (maskBit === 1 ? 255 : 0) : 255;
    imageData[i * 4 + 0] = gray8;
    imageData[i * 4 + 1] = gray8;
    imageData[i * 4 + 2] = gray8;
    imageData[i * 4 + 3] = alpha;
  }
  return { width, height, imageData, hasMask, depth: 7 };
}

function encodeGB7(canvas, hasMask = false) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height).data;
  const header = new Uint8Array(12);
  header[0] = 0x47; header[1] = 0x42; header[2] = 0x37; header[3] = 0x1D;
  header[4] = 0x01;
  header[5] = hasMask ? 0x01 : 0x00;
  header[6] = (width >> 8) & 0xFF; header[7] = width & 0xFF;
  header[8] = (height >> 8) & 0xFF; header[9] = height & 0xFF;
  header[10] = 0x00; header[11] = 0x00;

  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2], a = src[i * 4 + 3];
    const gray8 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const gray7 = Math.round((gray8 / 255) * 127) & 0x7F;
    const maskBit = hasMask ? (a > 127 ? 1 : 0) : 0;
    pixels[i] = (maskBit << 7) | gray7;
  }
  const out = new Uint8Array(12 + pixels.length);
  out.set(header); out.set(pixels, 12);
  return out;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImageEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState({ width: 0, height: 0, depth: 0, format: "", name: "" });
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [hasImage, setHasImage] = useState(false);

  const drawToCanvas = useCallback((width, height, imageData) => {
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const id = new ImageData(imageData, width, height);
    ctx.putImageData(id, 0, 0);
  }, []);

  const loadImageFile = useCallback((file) => {
    setError("");
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "gb7") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { width, height, imageData, depth } = decodeGB7(e.target.result);
          drawToCanvas(width, height, imageData);
          setStatus({ width, height, depth, format: "GB7", name: file.name });
          setHasImage(true);
        } catch (err) {
          setError("Ошибка декодирования GB7: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (["png", "jpg", "jpeg"].includes(ext)) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        drawToCanvas(img.naturalWidth, img.naturalHeight,
          (() => {
            const tmp = document.createElement("canvas");
            tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
            const ctx = tmp.getContext("2d");
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, tmp.width, tmp.height).data;
          })()
        );
        setStatus({ width: img.naturalWidth, height: img.naturalHeight, depth: 24, format: ext.toUpperCase(), name: file.name });
        setHasImage(true);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } else {
      setError("Неподдерживаемый формат. Используйте PNG, JPG или GB7.");
    }
  }, [drawToCanvas]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
  };

  const downloadAs = (fmt) => {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    if (fmt === "png") {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "image.png"; a.click();
    } else if (fmt === "jpg") {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = "image.jpg"; a.click();
    } else if (fmt === "gb7") {
      const bytes = encodeGB7(canvas, false);
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "image.gb7"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  };

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#0f0f0f",
      color: "#e8e0d4",
      fontFamily: "'Courier New', Courier, monospace",
      display: "flex",
      flexDirection: "column",
    },
    topbar: {
      background: "#1a1a1a",
      borderBottom: "1px solid #2a2a2a",
      padding: "0 1.5rem",
      height: "48px",
      display: "flex",
      alignItems: "center",
      gap: "2rem",
      flexShrink: 0,
    },
    logo: {
      fontSize: "13px",
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      color: "#a0c878",
      fontWeight: "bold",
    },
    menuItem: {
      fontSize: "12px",
      color: "#888",
      cursor: "pointer",
      letterSpacing: "0.05em",
      userSelect: "none",
      padding: "4px 8px",
      borderRadius: "3px",
    },
    body: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    },
    toolbar: {
      background: "#161616",
      borderBottom: "1px solid #222",
      padding: "8px 1.5rem",
      display: "flex",
      gap: "8px",
      alignItems: "center",
      flexWrap: "wrap",
      flexShrink: 0,
    },
    btn: {
      background: "#242424",
      border: "1px solid #333",
      color: "#ccc",
      padding: "5px 14px",
      fontSize: "11px",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      cursor: "pointer",
      borderRadius: "2px",
      fontFamily: "inherit",
      transition: "background 0.15s, color 0.15s",
    },
    btnPrimary: {
      background: "#1e3a14",
      border: "1px solid #3a6428",
      color: "#a0c878",
    },
    separator: {
      width: "1px",
      height: "24px",
      background: "#2a2a2a",
      margin: "0 4px",
    },
    label: {
      fontSize: "10px",
      color: "#555",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
    canvasArea: {
      flex: 1,
      overflow: "auto",
      padding: "2rem",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      background: "repeating-conic-gradient(#161616 0% 25%, #191919 0% 50%) 0 0 / 20px 20px",
    },
    dropzone: {
      width: "100%",
      maxWidth: "600px",
      aspectRatio: "4/3",
      border: "1px dashed #333",
      borderRadius: "4px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "1rem",
      cursor: "pointer",
      transition: "border-color 0.2s, background 0.2s",
      background: isDragging ? "#1a2a14" : "#141414",
      borderColor: isDragging ? "#a0c878" : "#333",
    },
    dropIcon: {
      fontSize: "48px",
      opacity: 0.3,
      lineHeight: 1,
    },
    dropText: {
      fontSize: "12px",
      color: "#555",
      textAlign: "center",
      letterSpacing: "0.05em",
    },
    dropSub: {
      fontSize: "10px",
      color: "#3a3a3a",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
    canvas: {
      imageRendering: "pixelated",
      maxWidth: "100%",
      display: "block",
      boxShadow: "0 0 40px rgba(0,0,0,0.8), 0 0 0 1px #2a2a2a",
    },
    statusbar: {
      background: "#141414",
      borderTop: "1px solid #222",
      padding: "5px 1.5rem",
      display: "flex",
      gap: "2rem",
      alignItems: "center",
      flexShrink: 0,
      flexWrap: "wrap",
    },
    statItem: {
      display: "flex",
      gap: "6px",
      alignItems: "center",
    },
    statLabel: {
      fontSize: "10px",
      color: "#444",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    statValue: {
      fontSize: "11px",
      color: "#a0c878",
      fontFamily: "inherit",
    },
    error: {
      background: "#2a1414",
      border: "1px solid #5a2020",
      color: "#e87878",
      padding: "8px 1rem",
      fontSize: "11px",
      margin: "1rem",
      borderRadius: "3px",
    },
  };

  return (
    <div style={styles.app}>
      <style>{`
        button:hover { background: #2e2e2e !important; color: #e8e0d4 !important; }
        .btn-primary:hover { background: #2a4e1e !important; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Top bar */}
      <div style={styles.topbar}>
        <span style={styles.logo}>⬛ PixelLab</span>
        <span style={styles.menuItem}>Файл</span>
        <span style={styles.menuItem}>Вид</span>
        <span style={styles.menuItem}>Справка</span>
      </div>

      <div style={styles.body}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <span style={styles.label}>Загрузить:</span>
          <button style={styles.btn} onClick={() => fileInputRef.current?.click()}>
            📂 Открыть файл
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gb7"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <div style={styles.separator} />
          <span style={styles.label}>Скачать:</span>
          <button
            style={{ ...styles.btn, ...(hasImage ? styles.btnPrimary : {}), opacity: hasImage ? 1 : 0.4 }}
            className="btn-primary"
            onClick={() => downloadAs("png")}
            disabled={!hasImage}
          >↓ PNG</button>
          <button
            style={{ ...styles.btn, ...(hasImage ? styles.btnPrimary : {}), opacity: hasImage ? 1 : 0.4 }}
            className="btn-primary"
            onClick={() => downloadAs("jpg")}
            disabled={!hasImage}
          >↓ JPG</button>
          <button
            style={{ ...styles.btn, ...(hasImage ? styles.btnPrimary : {}), opacity: hasImage ? 1 : 0.4 }}
            className="btn-primary"
            onClick={() => downloadAs("gb7")}
            disabled={!hasImage}
          >↓ GB7</button>
        </div>

        {/* Error */}
        {error && <div style={styles.error}>⚠ {error}</div>}

        {/* Canvas area */}
        <div
          style={styles.canvasArea}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {!hasImage ? (
            <div style={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
              <div style={styles.dropIcon}>◫</div>
              <div style={styles.dropText}>
                Перетащите файл сюда<br />или нажмите для выбора
              </div>
              <div style={styles.dropSub}>PNG · JPG · GB7</div>
            </div>
          ) : (
            <canvas ref={canvasRef} style={styles.canvas} />
          )}
          {/* Hidden canvas for when no image yet */}
          {hasImage ? null : <canvas ref={canvasRef} style={{ display: "none" }} />}
        </div>

        {/* Status bar */}
        <div style={styles.statusbar}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Файл</span>
            <span style={styles.statValue}>{status.name || "—"}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Формат</span>
            <span style={styles.statValue}>{status.format || "—"}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Ширина</span>
            <span style={styles.statValue}>{status.width ? `${status.width} px` : "—"}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Высота</span>
            <span style={styles.statValue}>{status.height ? `${status.height} px` : "—"}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Глубина</span>
            <span style={styles.statValue}>{status.depth ? `${status.depth} бит/пкс` : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
