import { useState } from "react";

/**
 * "Copy shareable link" for any engine. The address bar is kept in sync
 * with the open engine and its settings (App.jsx), so the link is simply
 * the current URL.
 */
export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context): offer it by hand.
      try {
        window.prompt("Copy this link:", url);
      } catch {
        // Some embedded browsers block prompt() too; the address bar
        // already holds the same link.
      }
    }
  }

  return (
    <button type="button" className="reset-button" onClick={copy} title="Copy a link that opens this engine with exactly these settings">
      {copied ? "Link copied!" : "Copy shareable link"}
    </button>
  );
}
