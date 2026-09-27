import * as Phaser from 'phaser';
import { MAX_PLAYERS, MIN_PLAYERS, SETTINGS } from '/shared/lobbyRules.js';
import { request, socket } from '../socket.js';
import { addCenteredPanel, escapeHtml } from '../ui.js';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
  }

  // data.lobby: lobby state from the lobby:create / lobby:join acknowledgement
  init(data) {
    this.lobby = data.lobby;
  }

  create() {
    const settingInputs = Object.entries(SETTINGS).map(([key, rule]) => `
      <label for="setting-${key}">${rule.label} (${rule.min}–${rule.max})</label>
      <input id="setting-${key}" type="number" data-setting="${key}" min="${rule.min}" max="${rule.max}">
    `).join('');

    const panel = addCenteredPanel(this, `
      <div class="panel">
        <p class="subtitle">Room code</p>
        <div class="code" data-code></div>
        <p class="hint">Share this code with your friends</p>

        <h2>Players (<span data-count></span>/${MAX_PLAYERS})</h2>
        <ul data-players></ul>

        <h2>Settings</h2>
        ${settingInputs}

        <div class="row">
          <button data-action="ready"></button>
          <button data-action="start">Start game</button>
        </div>
        <div class="row"><button class="secondary" data-action="leave">Leave lobby</button></div>

        <p class="error" data-error></p>
      </div>
    `);

    this.el = panel.node;
    this.errorText = this.el.querySelector('[data-error]');

    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onSettingChange(e));

    const onState = (lobby) => { this.lobby = lobby; this.render(); };
    const onKicked = () => this.scene.start('MenuScene', { message: 'You were kicked from the lobby' });
    const onDisconnect = () => this.scene.start('MenuScene', { message: 'Lost connection to the server' });

    socket.on('lobby:state', onState);
    socket.on('lobby:kicked', onKicked);
    socket.on('disconnect', onDisconnect);
    this.events.once('shutdown', () => {
      socket.off('lobby:state', onState);
      socket.off('lobby:kicked', onKicked);
      socket.off('disconnect', onDisconnect);
    });

    this.render();
  }

  get me() {
    return this.lobby.players.find((p) => p.id === socket.id);
  }

  get isHost() {
    return this.lobby.hostId === socket.id;
  }

  get canStart() {
    const { players } = this.lobby;
    return players.length >= MIN_PLAYERS && players.every((p) => p.ready);
  }

  render() {
    const { code, hostId, players, settings } = this.lobby;
    const el = this.el;

    el.querySelector('[data-code]').textContent = code;
    el.querySelector('[data-count]').textContent = players.length;

    el.querySelector('[data-players]').innerHTML = players.map((p) => `
      <li>
        <span class="name">${escapeHtml(p.name)}${p.id === socket.id ? ' (you)' : ''}</span>
        ${p.id === hostId ? '<span class="tag host">host</span>' : ''}
        <span class="tag ${p.ready ? 'ready' : ''}">${p.ready ? 'ready' : 'not ready'}</span>
        ${this.isHost && p.id !== socket.id ? `<button class="small" data-action="kick" data-player="${escapeHtml(p.id)}">kick</button>` : ''}
      </li>
    `).join('');

    for (const input of el.querySelectorAll('[data-setting]')) {
      input.disabled = !this.isHost;
      // Don't overwrite a value the host is typing right now.
      if (document.activeElement !== input) input.value = settings[input.dataset.setting];
    }

    el.querySelector('[data-action="ready"]').textContent = this.me?.ready ? 'Not ready' : 'Ready';

    const startButton = el.querySelector('[data-action="start"]');
    startButton.hidden = !this.isHost;
    startButton.disabled = !this.canStart;
    startButton.title = this.canStart ? '' : `Needs at least ${MIN_PLAYERS} players, all ready`;
  }

  async onClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    this.errorText.textContent = '';

    switch (button.dataset.action) {
      case 'ready':
        this.showError(await request('lobby:ready', { ready: !this.me?.ready }));
        break;
      case 'kick':
        this.showError(await request('lobby:kick', { playerId: button.dataset.player }));
        break;
      case 'leave':
        await request('lobby:leave');
        this.scene.start('MenuScene');
        break;
      case 'start':
        // TODO: send game:start once the game itself exists.
        this.errorText.textContent = 'Starting the game is not built yet';
        break;
    }
  }

  async onSettingChange(e) {
    const key = e.target.dataset.setting;
    if (!key) return;
    const res = await request('lobby:settings', { [key]: Number(e.target.value) });
    this.showError(res);
    if (!res.ok) this.render(); // put the old value back
  }

  showError(res) {
    this.errorText.textContent = res.ok ? '' : res.error;
  }
}
