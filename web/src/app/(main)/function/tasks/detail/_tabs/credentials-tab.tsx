"use client";

import * as React from "react";

import { CopyIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { TaskCredential } from "@/lib/types";

// Credentials tab (#3): the task's test accounts — user-declared (program alias
// accounts) and agent-recorded (accounts the workers registered themselves).
// Passwords render masked; reveal and copy are explicit.
export function CredentialsTab({ taskId }: { taskId: string }) {
  const [items, setItems] = React.useState<TaskCredential[] | null>(null);
  const [error, setError] = React.useState("");
  const [revealed, setRevealed] = React.useState<Set<number>>(new Set());
  const [domain, setDomain] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [note, setNote] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(() => {
    api
      .taskCredentials(taskId)
      .then((r) => {
        setItems(r);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [taskId]);

  React.useEffect(() => {
    load();
    // Agent runs can record credentials mid-task; a light poll keeps the tab current.
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function add() {
    if (!domain.trim() || !username.trim()) return;
    setAdding(true);
    try {
      await api.addTaskCredential(taskId, {
        domain: domain.trim(),
        username: username.trim(),
        password, // empty = "agent generates and records it"
        note: note.trim(),
      });
      setDomain("");
      setUsername("");
      setPassword("");
      setNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteTaskCredential(taskId, id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggle(id: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>测试账号</CardTitle>
        <CardDescription>
          本任务使用的测试账号。密码留空时，由智能体注册账号并记录密码；智能体记录的账号会自动显示在此处。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {items === null ? (
          <Skeleton className="h-24 w-full" />
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>暂无测试账号</EmptyTitle>
              <EmptyDescription>
                可在下方添加，或在创建任务时填写。智能体将使用这些账号执行登录后的测试。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col divide-y">
            {items.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <code className="text-sm font-medium">{c.domain}</code>
                <span className="text-muted-foreground text-sm">{c.username}</span>
                <Badge variant={c.source === "agent" ? "secondary" : "outline"}>
                  {c.source === "agent" ? "智能体记录" : "手动填写"}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  <code className="max-w-40 truncate rounded bg-muted px-2 py-0.5 text-sm">
                    {c.password === "" ? "— 由智能体生成 —" : revealed.has(c.id) ? c.password : "•".repeat(Math.min(c.password.length, 12))}
                  </code>
                  {c.password !== "" ? (
                    <>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={revealed.has(c.id) ? "隐藏密码" : "显示密码"} onClick={() => toggle(c.id)}>
                        {revealed.has(c.id) ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label="复制密码"
                        onClick={() => navigator.clipboard?.writeText(c.password).catch(() => {})}
                      >
                        <CopyIcon />
                      </Button>
                    </>
                  ) : null}
                  <Button size="icon" variant="ghost" className="size-7" aria-label="删除凭证" onClick={() => remove(c.id)}>
                    <TrashIcon />
                  </Button>
                </div>
                {c.note ? <p className="text-muted-foreground w-full text-xs">{c.note}</p> : null}
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="域名，如 target.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Input placeholder="邮箱或用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            placeholder="密码（留空由智能体生成）"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button variant="outline" disabled={adding || !domain.trim() || !username.trim()} onClick={add}>
            <PlusIcon /> 添加
          </Button>
          <Input className="sm:col-span-4" placeholder="备注（可选，如项目专用账号）" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
