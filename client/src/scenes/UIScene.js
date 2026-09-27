import * as Phaser from 'phaser';
import { socket } from '../socket.js';
import { escapeHtml } from '../ui.js';

const OBJECTIVE_TEXT = {
  bench: 'Sit on the bench',
  door: 'Knock on the door',
  mailbox: 'Post a letter',
  stall: 'Buy something at the stall',
};

// HUD on top of GameScene: role, objectives, timer, police tokens. Plain HTML so zoom doesn't affect it.
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  init(data) {
    this.role = data.role;
    this.tokens = data.tokens;
    this.endsAt = data.endsAt;
  }

  create() {
    const hud = document.createElement('div');
    hud.className = 'hud';
    document.getElementById('game').appendChild(hud);
    this.hud = hud;

    const onTokens = ({ tokens }) => { this.tokens = tokens; this.render(); };
    socket.on('game:tokens', onTokens);

    const timer = setInterval(() => this.renderTimer(), 250);
    this.events.once('shutdown', () => {
      clearInterval(timer);
      socket.off('game:tokens', onTokens);
      hud.remove();
    });

    this.render();
  }

  render() {
    const { role, objectives } = this.role;
    const isPolice = role === 'police';

    const body = isPolice
      ? `<p>Find the hiders in the crowd and arrest them.</p>
         <p>Tokens: <b data-tokens>${this.tokens ?? '?'}</b></p>`
      : `<p>Blend in and complete your objectives:</p>
         <ul>${objectives.map((o) => `
           <li class="${o.done ? 'done' : ''}">${escapeHtml(OBJECTIVE_TEXT[o.type] ?? o.type)}
             <span class="objective-id">${escapeHtml(o.objectiveId)}</span></li>`).join('')}
         </ul>`;

    this.hud.innerHTML = `
      <div class="hud-role ${isPolice ? 'police' : 'hider'}">${isPolice ? 'POLICE' : 'HIDER'}</div>
      <div class="hud-timer" data-timer></div>
      ${body}
    `;
    this.renderTimer();
  }

  renderTimer() {
    const secondsLeft = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    const text = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
    this.hud.querySelector('[data-timer]').textContent = text;
  }
}
