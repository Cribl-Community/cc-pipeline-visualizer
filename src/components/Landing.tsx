import type { ReactNode } from 'react';
import { Bullseye, ChevronLeft, ChevronRight, Packs, Pipeline, Play } from '@capra/icons';
import goatImg from '../assets/goat-header.webp';
import './Landing.css';

interface Mode {
  pack: boolean;
  icon: ReactNode;
  title: string;
  path: string;
  button: string;
}

const MODES: Mode[] = [
  { pack: true, icon: <Packs />, title: 'Pack pipelines', path: 'Worker group → Pack → Pipeline', button: 'Open packs' },
  { pack: false, icon: <Pipeline />, title: 'Worker group pipelines', path: 'Worker group → Pipeline', button: 'Open pipelines' },
];

const Pin = ({ n }: { n: number }) => <span className="lp-pin">{n}</span>;

/** A small copy of the editor with numbered pins on the controls the steps name. Only a picture. */
function Tour() {
  const fns = ['Parser', 'Eval', 'Drop', 'Serialize'];
  return (
    <div className="lp-screen" aria-hidden="true">
      <div className="lp-chrome">
        <i />
        <i />
        <i />
        <span>Pipeline Visualizer · fortinet_fw › main</span>
      </div>
      <div className="lp-app">
        <div className="lp-app-l">
          {fns.map((f, i) => (
            <div key={f} className={`lp-fn${i === 1 ? ' on' : ''}`}>
              <span className="lp-fn-n">{i + 1}</span>
              <span className="lp-fn-name">{f}</span>
              <span className={`lp-bull${i === 1 ? ' lp-ring' : ''}`}>
                <Bullseye />
              </span>
              {i === 1 && <Pin n={1} />}
            </div>
          ))}
        </div>
        <div className="lp-app-r">
          <div className="lp-ctl">
            <span className="lp-lbl">Preview</span>
            <span className="lp-sel">Before &amp; after one function ▾</span>
            <span className="lp-run">
              <Play /> Run
            </span>
          </div>
          <div className="lp-focus">
            <span className="lp-step lp-ring">
              <ChevronLeft />
            </span>
            <span className="lp-focus-n">2</span>
            <b>Eval</b>
            <span className="lp-step lp-ring">
              <ChevronRight />
            </span>
            <span className="lp-stat">Events 120 → 120 · Bytes 61 KB → 48 KB</span>
            <Pin n={2} />
          </div>
          <div className="lp-seg">
            <span>IN</span>
            <span>OUT</span>
            <span className="on lp-ring">IN | OUT</span>
            <Pin n={3} />
          </div>
          <div className="lp-io">
            <div>
              <b>IN · before #2 Eval</b>
              <span>host: fw-01</span>
              <span className="rem">_raw: &lt;134&gt;1 2026-10-15…</span>
              <span>action: accept</span>
              <span>bytes: 512</span>
            </div>
            <div>
              <b>OUT · after #2 Eval</b>
              <span>host: fw-01</span>
              <span className="chg">action: allow</span>
              <span className="add">severity: low</span>
              <span>bytes: 512</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Start screen: what the app is for, shown on its own controls, then a choice between pack pipelines and the worker group's own. */
export function Landing({ onPick }: { onPick: (pack: boolean) => void }) {
  return (
    <div className="lp">
      <div className="lp-inner">
        <header className="lp-hero" aria-label="Cribl Pipeline Visualizer">
          <div className="lp-hero-main">
            <img src={goatImg} alt="Cribl Goat" className="lp-goat" />
            <div>
              <span className="lp-pill">✦ Live preview</span>
              <h1 className="lp-title">Cribl Pipeline Visualizer</h1>
              <p className="lp-sub">Select any function in a Stream pipeline and see your events just before and just after it, IN and OUT side by side.</p>
            </div>
          </div>
          <aside className="lp-hero-side" aria-label="Safe to explore">
            <h4>Safe to explore</h4>
            <ul>
              <li>
                <i aria-hidden="true">✓</i>Nothing changes until you press Save
              </li>
              <li>
                <i aria-hidden="true">✓</i>Saving does not deploy: commit and deploy in Cribl
              </li>
              <li>
                <i aria-hidden="true">✓</i>Previews run on a scratch pipeline
              </li>
            </ul>
          </aside>
        </header>

        <p className="lp-eyebrow">How it works</p>
        <h2>See what each function does to your events</h2>
        <p className="lp-desc">Open a pipeline, then:</p>
        <div className="lp-tour">
          <Tour />
          <ol className="lp-steps">
            <li className="main">
              <span className="lp-pin">1</span>
              <div>
                <b>
                  Click{' '}<span className="lp-inline-ic"><Bullseye /></span>{' '}on a function <span className="lp-rank">Before &amp; after</span>
                </b>
                <p>
                  The preview switches to <span className="lp-ui">Before &amp; after one function</span>. You see the events going into that function and coming out of it.
                </p>
              </div>
            </li>
            <li className="main">
              <span className="lp-pin">2</span>
              <div>
                <b>Step with ‹ ›</b>
                <p>Move to the previous or next function to follow your data through the pipeline, one change at a time.</p>
              </div>
            </li>
            <li>
              <span className="lp-pin">3</span>
              <div>
                <b>
                  IN and OUT side by side <span className="lp-rank">One screen</span>
                </b>
                <p>
                  The <span className="lp-ui">IN | OUT</span> view, on by default, shows both next to your pipeline. Added fields are green, changed are orange and removed are red.
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="lp-choose">
          <p className="lp-eyebrow">Get started</p>
          <h3>What would you like to open?</h3>
          <p className="lp-desc">You can switch any time with the Packs | Pipelines toggle at the top.</p>
          <div className="lp-modes">
            {MODES.map((m) => (
              <div key={m.title} className="lp-choice">
                <span className="lp-ic" aria-hidden="true">
                  {m.icon}
                </span>
                <div className="lp-choice-t">
                  <strong>{m.title}</strong>
                  <small>{m.path}</small>
                </div>
                <button type="button" className="lp-btn" onClick={() => onPick(m.pack)}>
                  {m.button} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
