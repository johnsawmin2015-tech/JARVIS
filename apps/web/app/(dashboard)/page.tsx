import { Chat } from "../../components/chat";

export default function CommandPage() {
  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Interactive plane</p>
          <h1>Command</h1>
        </div>
        <span className="badge">Permissioned · Audited</span>
      </div>
      <p className="subhead">
        Fast conversation is isolated from durable task execution. Models can reason and propose;
        server-side policy remains authoritative.
      </p>
      <Chat />
    </div>
  );
}
