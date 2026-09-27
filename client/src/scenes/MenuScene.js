import * as Phaser from 'phaser';
import { CODE_LENGTH, NAME_MAX_LENGTH } from '/shared/lobbyRules.js';
import { request, socket } from '../socket.js';
import { addCenteredPanel } from '../ui.js';

const NAME_STORAGE_KEY = 'playerName';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  // data.message: optional text to show, e.g. "You were kicked from the lobby"
  init(data) {
    this.message = data?.message ?? '';
  }

  create() {
    const panel = addCenteredPanel(this, `
      <div class="panel">
        <h1>Among The Crowd</h1>
        <p class="subtitle" data-status></p>

        <label for="name">Your name</label>
        <input id="name" data-name maxlength="${NAME_MAX_LENGTH}" autocomplete="off">

        <div class="row"><button data-action="create">Create lobby</button></div>

        <div class="divider">or join a friend</div>

        <label for="code">Room code</label>
        <div class="row">
          <input id="code" class="code-input" data-code maxlength="${CODE_LENGTH}" autocomplete="off">
          <button data-action="join">Join</button>
        </div>

        <p class="error" data-error></p>
      </div>
    `);

    const el = panel.node;
    const nameInput = el.querySelector('[data-name]');
    const codeInput = el.querySelector('[data-code]');
    const errorText = el.querySelector('[data-error]');
    const statusText = el.querySelector('[data-status]');
    const buttons = el.querySelectorAll('button');

    nameInput.value = loadName();
    errorText.textContent = this.message;

    const showStatus = () => {
      statusText.textContent = socket.connected ? 'Connected' : 'Connecting to server...';
    };
    showStatus();
    socket.on('connect', showStatus);
    socket.on('disconnect', showStatus);
    this.events.once('shutdown', () => {
      socket.off('connect', showStatus);
      socket.off('disconnect', showStatus);
    });

    const send = async (event, payload) => {
      buttons.forEach((b) => { b.disabled = true; });
      errorText.textContent = '';
      saveName(payload.name);

      const res = await request(event, payload);
      if (res.ok) {
        this.scene.start('LobbyScene', { lobby: res.lobby });
      } else {
        errorText.textContent = res.error;
        buttons.forEach((b) => { b.disabled = false; });
      }
    };

    const create = () => send('lobby:create', { name: nameInput.value });
    const join = () => send('lobby:join', { name: nameInput.value, code: codeInput.value });

    el.querySelector('[data-action="create"]').addEventListener('click', create);
    el.querySelector('[data-action="join"]').addEventListener('click', join);
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  }
}

// localStorage can throw (private mode, blocked storage); the name is only a convenience.
function loadName() {
  try { return localStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { return ''; }
}

function saveName(name) {
  try { localStorage.setItem(NAME_STORAGE_KEY, name.trim()); } catch { /* ignore */ }
}
