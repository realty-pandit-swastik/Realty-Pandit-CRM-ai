/**
 * Wire protocol between the Android handset and the VPS call-gateway.
 *
 * The phone is ALWAYS the connecting party (it sits behind Jio CGNAT and has no
 * reachable IP), so every transport concern here assumes a phone-initiated,
 * long-lived socket that may drop at any moment.
 *
 * Two invariants the rest of the service depends on:
 *   1. Every server->phone command carries a `commandId`, is acked, and is
 *      deduped phone-side. A socket blip during `dial` must never re-dial a customer.
 *   2. The server NEVER infers call state. The phone is the sole source of truth;
 *      the server only reacts to reported transitions.
 */

/** Android TelephonyManager.CALL_STATE_* — same integers, kept deliberately. */
export const CALL_STATE = {
    IDLE: 0,
    RINGING: 1,
    OFFHOOK: 2,
} as const;

export type CallState = (typeof CALL_STATE)[keyof typeof CALL_STATE];

export type LineRole = 'outbound' | 'inbound';

export interface LineInfo {
    /** Android subscription id — NOT the slot index. Stable per SIM. */
    subId: number;
    role: LineRole;
    /** False when the SIM is absent or out of service; the line is unusable. */
    inService: boolean;
}

// ─── phone -> server ────────────────────────────────────────────────────────

export interface HelloMsg {
    type: 'hello';
    deviceId: string;
    deviceToken: string;
    appVersion: string;
    androidBuild: string;
    lines: LineInfo[];
}

export interface HeartbeatMsg {
    type: 'heartbeat';
    ts: number;
}

/**
 * A reported call-state transition. `callId` is present once the phone has
 * correlated the transition with a server-issued command (outbound) or has
 * minted one itself (inbound).
 */
export interface CallStateMsg {
    type: 'call_state';
    subId: number;
    state: CallState;
    /** E.164 where the platform gives it to us. Inbound caller id arrives as +91… */
    number: string | null;
    direction: 'inbound' | 'outbound';
    callId: string | null;
}

export interface CommandAckMsg {
    type: 'command_ack';
    commandId: string;
    /** False when the phone refused — e.g. it deduped a replay, or the line was busy. */
    accepted: boolean;
    reason?: string;
}

export interface ErrorMsg {
    type: 'error';
    commandId?: string;
    code: string;
    message: string;
}

export type PhoneToServer =
    | HelloMsg
    | HeartbeatMsg
    | CallStateMsg
    | CommandAckMsg
    | ErrorMsg;

// ─── server -> phone ────────────────────────────────────────────────────────

/**
 * `issuedAtMillis` is mandatory on every command and the phone MUST fail closed on
 * anything older than the TTL.
 *
 * Why: a command queued during a CGNAT drop would otherwise be delivered on
 * reconnect and dial a real customer minutes after the operator's intent expired.
 * Dedupe does not help — the retry carries the SAME commandId, and a freshly issued
 * one is legitimately new. Only an age check stops a stale dial.
 */
export interface DialCmd {
    type: 'dial';
    commandId: string;
    issuedAtMillis: number;
    callId: string;
    subId: number;
    /** Always E.164. Normalisation happens server-side, never on the phone. */
    number: string;
}

export interface AnswerCmd {
    type: 'answer';
    commandId: string;
    issuedAtMillis: number;
    callId: string;
    subId: number;
}

export interface HangupCmd {
    type: 'hangup';
    commandId: string;
    issuedAtMillis: number;
    callId: string;
    subId: number;
}

/**
 * Commands older than this must be refused by the phone AND never re-sent by the
 * server. Hangup is exempt at the server (see server.ts) — cancelling a call late
 * is safe; starting one late is not.
 */
export const COMMAND_TTL_MS = 60_000;

export interface HelloOkMsg {
    type: 'hello_ok';
    /** Echoed back so the phone can detect a server restart and resync. */
    sessionId: string;
    heartbeatSec: number;
}

export interface PingMsg {
    type: 'ping';
    ts: number;
}

export type ServerToPhone = DialCmd | AnswerCmd | HangupCmd | HelloOkMsg | PingMsg;

export type Command = DialCmd | AnswerCmd | HangupCmd;

export function isCommand(msg: ServerToPhone): msg is Command {
    return msg.type === 'dial' || msg.type === 'answer' || msg.type === 'hangup';
}
