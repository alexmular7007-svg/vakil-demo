// Re-mounts on every navigation inside the workspace, giving each screen a short
// app-like entrance (opacity and a 6px lift; disabled under reduced motion).
export default function WorkspaceTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
