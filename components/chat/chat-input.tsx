"use client";

import * as React from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChatInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form className="flex items-center gap-2 border-t p-3" onSubmit={handleSubmit}>
      <Input
        placeholder="Ask a question about this notebook…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled || !value.trim()} size="icon">
        <SendHorizonal />
      </Button>
    </form>
  );
}
