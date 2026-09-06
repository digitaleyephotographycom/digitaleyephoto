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
          <div className="role-cards">
            <div className="role-card">
              <h3>Photographer</h3>
              <p>
                Manage galleries, upload shoots, share access and review
                client selections.
              </p>
              <Link href="/studio" className="btn btn-primary">
                Open studio dashboard →
              </Link>
            </div>
            <div className="role-card">
              <h3>Client gallery</h3>
              <p>
                Enter the gallery code and password to view, select and send
                your favourites.
              </p>
              <Link href="/gallery" className="btn btn-soft">
                Enter private gallery →
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
