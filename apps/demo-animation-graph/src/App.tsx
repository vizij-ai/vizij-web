import React from "react";
import { IkGraphDemo } from "./demos/IkGraphDemo";
import { SlewDampDemo } from "./demos/SlewDampDemo";

export default function App() {
  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #1e293b, #020617)",
        color: "#e2e8f0",
        padding: "32px 24px 80px",
      }}
    >
      <main
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: "2.4rem", lineHeight: 1.1 }}>
            Animation × Node Graph integration demos
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "1.05rem",
              lineHeight: 1.6,
              maxWidth: 780,
            }}
          >
            Both examples load StoredAnimation clips through{" "}
            <code>@vizij/animation-react</code>
            and stream the resolved values into{" "}
            <code>@vizij/node-graph-react</code> graphs. The helpers in this
            demo synthesise typed paths so that tracks, node graph inputs and
            graph outputs all reference the same canonical channels. Each chart
            below visualises the animation source and the processed graph
            outputs over time.
          </p>
        </section>

        <IkGraphDemo />
        <SlewDampDemo />
      </main>
    </div>
  );
}
