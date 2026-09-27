import * as Phaser from 'phaser';
import { OBJECTIVE_TYPES } from '/shared/objectives.js';
import { socket } from '../socket.js';
import { escapeHtml } from '../ui.js';

const MESSAGE_MS = 2500;

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

    const message = document.createElement('div');
    message.className = 'hud-message';
    message.hidden = true;
    document.getElementById('game').appendChild(message);
    this.message = message;

    const onTokens = ({ tokens }) => { this.tokens = tokens; this.render(); };
    const onObjective = ({ objectiveId, done }) => {
      const objective = this.role.objectives?.find((o) => o.objectiveId === objectiveId);
      if (!objective) return;
      objective.done = done;
      this.render();
      if (done) this.showMessage(`Done: ${OBJECTIVE_TYPES[objective.type]?.text ?? objective.type}`);
    };
    socket.on('game:tokens', onTokens);
    socket.on('game:objective', onObjective);

    const timer = setInterval(() => this.renderTimer(), 250);
    this.events.once('shutdown', () => {
      clearInterval(timer);
      clearTimeout(this.messageTimer);
      socket.off('game:tokens', onTokens);
      socket.off('game:objective', onObjective);
      hud.remove();
      message.remove();
    });

    this.render();
  }

  // Short message at the bottom of the screen, e.g. why an action didn't work.
  showMessage(text) {
    this.message.textContent = text;
    this.message.hidden = false;
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => { this.message.hidden = true; }, MESSAGE_MS);
  }

  render() {
    const { role, objectives } = this.role;
    const isPolice = role === 'police';

    const body = isPolice
      ? `<p>Find the hiders in the crowd and arrest them.</p>
         <p>Tokens: <b>${this.tokens ?? '?'}</b></p>`
      : `<p>Blend in and complete your objectives:</p>
         <ul>${objectives.map((o) => `
           <li class="${o.done ? 'done' : ''}">${escapeHtml(OBJECTIVE_TYPES[o.type]?.text ?? o.type)}</li>`).join('')}
         </ul>
         <p class="hud-keys"><b>E</b> use the spot you're on (bench, window, door, mailbox, stall)<br>
         <b>R</b> run in circles</p>`;

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
