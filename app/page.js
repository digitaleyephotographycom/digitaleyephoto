import Link from "next/link";

export default function Home() {
  return (
    <section className="landing">
      <div className="landing-inner">
        <div>
          <div className="eyebrow">Private photo proofing studio</div>
          <h1>
            Your moments,
            <br />
            <i>beautifully delivered.</i>
          </h1>
          <p className="lede">
            Create private client galleries, share a simple password, collect
            favourite photos and bring the exact print shortlist back into
            your studio.
          </p>
          <div className="role-cards" style={{ gridTemplateColumns: "1fr", maxWidth: "440px" }}>
            <div className="role-card">
              <h3>Photographer Studio</h3>
              <p>
                Manage client proofing galleries, upload high-resolution shoots, and review client selections.
              </p>
              <Link href="/studio" className="btn btn-primary" style={{ padding: "13px 24px", fontSize: "14px" }}>
                Open Studio →
              </Link>
            </div>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-photo">
            <div
              style={{
                width: "100%",
                height: "100%",
                background:
                  "linear-gradient(145deg,#9c7658,#e9d1b0 52%,#8b6249)",
                display: "grid",
                placeItems: "center",
                color: "#fff6e9",
                font: "italic 34px Georgia",
              }}
            >
              your story
            </div>
          </div>
          <div className="art-card">
            <small>Client proofing</small>
            <strong>Full-quality galleries</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
