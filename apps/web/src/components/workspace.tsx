"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, ArrowUpRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { message } from "@/lib/api";
import { Glossary, openGlossary } from "./glossary";

export function Loading({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={18} className="spinner" />
      {label}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <p className={error ? "notice error" : "notice"} role={error ? "alert" : "status"}>
      {children}
    </p>
  );
}
export function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="external">
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replaceAll("_", " ")}</span>;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function Workspace({ children }: { children: React.ReactNode }) {
  const { data, isPending, error } = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    if (!isPending && !data && !error) router.replace("/login");
  }, [data, isPending, error, router]);
  if (isPending || (!data && !error)) return <Loading />;
  if (error)
    return (
      <main className="auth-page">
        <Notice error>We couldn’t check your session. {error.message}</Notice>
        <button onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  if (!data) return null;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Qublox sales home">
          <span className="brand-wordmark">QUBLOX</span>
          <span className="brand-sub">Sales</span>
        </Link>
        <nav aria-label="Workspace">
          {(
            [
              ["/", "Prospects"],
              ["/campaigns", "Offers"],
              ["/follow-ups", "Follow-ups"],
              ["/outbox", "Outbox"],
              ["/settings", "Settings"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                pathname === href || (href === "/" && pathname.startsWith("/prospects/"))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="identity">
          <button type="button" className="text-button help-link" onClick={() => openGlossary()}>
            Help
          </button>
          <span title={data.user.email}>{data.user.name}</span>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              try {
                const result = await authClient.signOut();
                if (result.error) throw new Error(result.error.message);
                router.replace("/login");
              } catch (e) {
                setSignOutError(message(e));
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <Glossary />
      <main id="main" className="workspace">
        {signOutError && <Notice error>{signOutError}</Notice>}
        {children}
      </main>
      <footer className="workspace-footer">
        <span>Qublox / Private team workspace</span>
        <span>Research → review → reach out</span>
      </footer>
    </>
  );
}
