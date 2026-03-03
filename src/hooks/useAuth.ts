import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export interface DeviceCodeResponse {
    userCode: string;
    deviceCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresIn: number;
    interval: number;
    message: string;
}

export interface AuthState {
    msAccessToken: string;
    msRefreshToken: string;
    mcAccessToken: string;
    profile: {
        id: string;
        name: string;
        skinUrl?: string;
    };
}

export type AuthDebugPhase =
    | 'idle'
    | 'requesting_code'
    | 'awaiting_approval'
    | 'polling'
    | 'authenticated'
    | 'expired'
    | 'error'
    | 'cancelled';

export interface AuthDebug {
    phase: AuthDebugPhase;
    pollAttempts: number;
    pollIntervalSeconds: number;
    expiresAtMs: number | null;
    lastPollAtMs: number | null;
    nextPollAtMs: number | null;
    activeUserCode: string | null;
    activeVerificationUri: string | null;
    activeVerificationUriComplete: string | null;
    lastMessage: string | null;
}

interface AuthContextValue {
    authState: AuthState | null;
    profileAvatarUrl: string | null;
    deviceCode: DeviceCodeResponse | null;
    loading: boolean;
    error: string | null;
    authDebug: AuthDebug;
    startLogin: () => Promise<void>;
    openLoginInBrowser: () => Promise<boolean>;
    cancelLogin: () => void;
    dismissAuthOverlay: () => void;
    clearError: () => void;
    logout: () => void;
    uploadSkin: (fileName: string, data: number[], model?: 'classic' | 'slim') => Promise<void>;
    setProfileAvatar: (dataUrl: string) => void;
    clearProfileAvatar: () => void;
}

const AUTH_STORAGE_KEY = 'bloom_auth_state';
const PROFILE_AVATAR_KEY_PREFIX = 'bloom_profile_avatar_';
const AuthContext = createContext<AuthContextValue | null>(null);
const FALLBACK_MS_LINK = 'https://www.microsoft.com/link';

const INITIAL_DEBUG_STATE: AuthDebug = {
    phase: 'idle',
    pollAttempts: 0,
    pollIntervalSeconds: 0,
    expiresAtMs: null,
    lastPollAtMs: null,
    nextPollAtMs: null,
    activeUserCode: null,
    activeVerificationUri: null,
    activeVerificationUriComplete: null,
    lastMessage: null
};

function toErrorMessage(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
        return (err as any).message;
    }
    return String(err);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    }) as Promise<T>;
}

function normalizeDeviceCodeResponse(raw: any): DeviceCodeResponse {
    const userCode = raw?.userCode ?? raw?.user_code ?? '';
    const deviceCode = raw?.deviceCode ?? raw?.device_code ?? '';
    const verificationUri = raw?.verificationUri ?? raw?.verification_uri ?? '';
    const verificationUriComplete = raw?.verificationUriComplete ?? raw?.verification_uri_complete ?? undefined;
    const expiresInRaw = raw?.expiresIn ?? raw?.expires_in;
    const intervalRaw = raw?.interval;
    const message = raw?.message ?? '';

    const expiresIn = Number(expiresInRaw);
    const interval = Number(intervalRaw);

    if (!userCode || !deviceCode || !verificationUri || !Number.isFinite(expiresIn) || !Number.isFinite(interval)) {
        throw new Error('Invalid auth start response. Missing Microsoft device login fields.');
    }

    return {
        userCode: String(userCode),
        deviceCode: String(deviceCode),
        verificationUri: String(verificationUri),
        verificationUriComplete: verificationUriComplete ? String(verificationUriComplete) : undefined,
        expiresIn,
        interval,
        message: String(message)
    };
}

function useAuthController(): AuthContextValue {
    const [authState, setAuthState] = useState<AuthState | null>(() => {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { return null; }
        }
        return null;
    });
    const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
    const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authDebug, setAuthDebug] = useState<AuthDebug>(INITIAL_DEBUG_STATE);
    const isUnmountedRef = useRef(false);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startRequestInFlightRef = useRef(false);
    const pollSessionIdRef = useRef(0);

    const clearPollTimeout = () => {
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
    };

    const getAvatarStorageKey = (profileId: string) => `${PROFILE_AVATAR_KEY_PREFIX}${profileId}`;

    const schedulePoll = (code: string, intervalSeconds: number, expiresAtMs: number, attempts: number, sessionId: number) => {
        clearPollTimeout();
        pollTimeoutRef.current = setTimeout(() => {
            void pollLogin(code, intervalSeconds, expiresAtMs, attempts, sessionId);
        }, intervalSeconds * 1000);
    };

    const clearActiveAuthCode = () => {
        setDeviceCode(null);
        setAuthDebug(prev => ({
            ...prev,
            activeUserCode: null,
            activeVerificationUri: null,
            activeVerificationUriComplete: null
        }));
    };

    const openLoginInBrowser = async (device?: DeviceCodeResponse): Promise<boolean> => {
        const targetUrl = device?.verificationUriComplete
            || device?.verificationUri
            || authDebug.activeVerificationUriComplete
            || authDebug.activeVerificationUri
            || FALLBACK_MS_LINK;

        console.log('[auth] opening browser URL', targetUrl);

        try {
            await withTimeout(
                invoke('auth_open_browser', { url: targetUrl }),
                5000,
                'Timed out while opening your default browser.'
            );
            setAuthDebug(prev => ({
                ...prev,
                lastMessage: 'Opened default browser for Microsoft sign-in.'
            }));
            return true;
        } catch (err) {
            console.error('Backend browser open failed:', err);
        }

        try {
            await openUrl(targetUrl);
            setAuthDebug(prev => ({
                ...prev,
                lastMessage: 'Opened browser for Microsoft sign-in.'
            }));
            return true;
        } catch (err) {
            console.error('Failed to open browser via opener plugin:', err);
        }

        const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (popup) {
            setAuthDebug(prev => ({
                ...prev,
                lastMessage: 'Opened browser fallback for Microsoft sign-in.'
            }));
            return true;
        } else {
            setError('Could not open browser automatically. Click the Microsoft link in the auth dialog.');
            setAuthDebug(prev => ({
                ...prev,
                lastMessage: 'Browser auto-open failed. Use the link manually.'
            }));
            return false;
        }
    };

    useEffect(() => {
        isUnmountedRef.current = false;
        return () => {
            isUnmountedRef.current = true;
            clearPollTimeout();
        };
    }, []);

    useEffect(() => {
        const profileId = authState?.profile.id;
        if (!profileId) {
            setProfileAvatarUrl(null);
            return;
        }
        const saved = localStorage.getItem(getAvatarStorageKey(profileId));
        setProfileAvatarUrl(saved || null);
    }, [authState?.profile.id]);

    useEffect(() => {
        if (!loading || authDebug.phase !== 'requesting_code') return;

        const requestTimer = setTimeout(() => {
            setLoading(false);
            const message = 'Timed out while requesting Microsoft device code. Try Sign In again.';
            setError(message);
            setAuthDebug(prev => ({
                ...prev,
                phase: 'error',
                lastMessage: message
            }));
        }, 12000);

        return () => clearTimeout(requestTimer);
    }, [loading, authDebug.phase]);

    const startLogin = async () => {
        if (loading || startRequestInFlightRef.current) return;

        startRequestInFlightRef.current = true;
        pollSessionIdRef.current += 1;
        const sessionId = pollSessionIdRef.current;

        try {
            setError(null);
            setLoading(true);
            clearPollTimeout();
            setDeviceCode(null);
            setAuthDebug({
                ...INITIAL_DEBUG_STATE,
                phase: 'requesting_code',
                lastMessage: 'Requesting Microsoft device code...'
            });

            const raw = await withTimeout(
                invoke<any>('auth_login_start'),
                15000,
                'Timed out contacting Microsoft login service.'
            );
            const res = normalizeDeviceCodeResponse(raw);
            console.log('[auth] login_start response', res);
            if (isUnmountedRef.current) return;

            setDeviceCode(res);
            const expiresAtMs = Date.now() + (res.expiresIn * 1000);
            setAuthDebug({
                phase: 'awaiting_approval',
                pollAttempts: 0,
                pollIntervalSeconds: res.interval,
                expiresAtMs,
                lastPollAtMs: null,
                nextPollAtMs: Date.now(),
                activeUserCode: res.userCode,
                activeVerificationUri: res.verificationUri,
                activeVerificationUriComplete: res.verificationUriComplete || null,
                lastMessage: 'Waiting for approval in your browser.'
            });

            console.log('[auth] starting poll loop', { sessionId, interval: res.interval });
            setTimeout(() => {
                if (pollSessionIdRef.current !== sessionId) return;
                void pollLogin(res.deviceCode, res.interval, expiresAtMs, 0, sessionId);
            }, 0);

            void openLoginInBrowser(res).then((opened) => {
                if (!opened) {
                    console.warn('[auth] browser did not open automatically; continuing with manual link flow.');
                }
            });
        } catch (err: unknown) {
            const message = toErrorMessage(err);
            console.error("Login start error:", err);
            setError(message);
            setAuthDebug({
                ...INITIAL_DEBUG_STATE,
                phase: 'error',
                lastMessage: message
            });
            setLoading(false);
        } finally {
            startRequestInFlightRef.current = false;
        }
    };

    const pollLogin = async (code: string, intervalSeconds: number, expiresAtMs: number, previousAttempts: number, sessionId: number) => {
        if (pollSessionIdRef.current !== sessionId) return;

        if (!code) {
            const message = 'Missing device code; cannot poll login status.';
            setError(message);
            setDeviceCode(null);
            setLoading(false);
            clearPollTimeout();
            setAuthDebug(prev => ({
                ...prev,
                phase: 'error',
                lastMessage: message,
                nextPollAtMs: null
            }));
            return;
        }

        const now = Date.now();
        if (now >= expiresAtMs) {
            const message = 'Device code expired before approval. Start sign-in again.';
            setError(message);
            setDeviceCode(null);
            setLoading(false);
            clearPollTimeout();
            setAuthDebug(prev => ({
                ...prev,
                phase: 'expired',
                lastMessage: message,
                expiresAtMs,
                nextPollAtMs: null
            }));
            return;
        }

        const attempt = previousAttempts + 1;
        console.log('[auth] poll attempt', { sessionId, attempt });
        setAuthDebug(prev => ({
            ...prev,
            phase: 'polling',
            pollAttempts: attempt,
            pollIntervalSeconds: intervalSeconds,
            expiresAtMs,
            lastPollAtMs: now,
            nextPollAtMs: now + (intervalSeconds * 1000),
            lastMessage: 'Checking authorization status...'
        }));

        try {
            const res = await withTimeout(
                invoke<AuthState | null>('auth_login_poll', { deviceCode: code }),
                20000,
                'Timed out while checking Microsoft approval status.'
            );
            if (isUnmountedRef.current) return;

            if (res) {
                console.log('[auth] poll approved', { sessionId, attempt, profile: res.profile?.name });
                setAuthState(res);
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res));
                setLoading(false);
                clearPollTimeout();
                setAuthDebug(prev => ({
                    ...prev,
                    phase: 'authenticated',
                    lastMessage: `Signed in as ${res.profile.name}.`,
                    nextPollAtMs: null,
                    activeUserCode: null,
                    activeVerificationUri: null,
                    activeVerificationUriComplete: null
                }));
                setDeviceCode(null);
            } else {
                console.log('[auth] poll pending', { sessionId, attempt });
                setAuthDebug(prev => ({
                    ...prev,
                    phase: 'awaiting_approval',
                    pollAttempts: attempt,
                    lastMessage: 'Still waiting for browser approval.'
                }));
                schedulePoll(code, intervalSeconds, expiresAtMs, attempt, sessionId);
            }
        } catch (err: unknown) {
            const message = toErrorMessage(err);
            console.error("Login poll error:", err);
            setError(message);
            setDeviceCode(null);
            setLoading(false);
            clearPollTimeout();
            setAuthDebug(prev => ({
                ...prev,
                phase: 'error',
                pollAttempts: attempt,
                lastMessage: message,
                nextPollAtMs: null
            }));
        }
    };

    const cancelLogin = () => {
        pollSessionIdRef.current += 1;
        clearPollTimeout();
        setLoading(false);
        setAuthDebug(prev => ({
            ...prev,
            phase: 'cancelled',
            nextPollAtMs: null,
            activeUserCode: null,
            activeVerificationUri: null,
            activeVerificationUriComplete: null,
            lastMessage: 'Sign-in cancelled.'
        }));
        setDeviceCode(null);
    };

    const dismissAuthOverlay = () => {
        const inProgress = loading
            || authDebug.phase === 'requesting_code'
            || authDebug.phase === 'awaiting_approval'
            || authDebug.phase === 'polling';

        if (inProgress) {
            cancelLogin();
            return;
        }

        clearActiveAuthCode();
    };

    const clearError = () => {
        setError(null);
    };

    const logout = () => {
        pollSessionIdRef.current += 1;
        clearPollTimeout();
        setAuthState(null);
        setLoading(false);
        setError(null);
        setAuthDebug(INITIAL_DEBUG_STATE);
        setDeviceCode(null);
        setProfileAvatarUrl(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
    };

    const setProfileAvatar = (dataUrl: string) => {
        const profileId = authState?.profile.id;
        if (!profileId) return;
        setProfileAvatarUrl(dataUrl);
        localStorage.setItem(getAvatarStorageKey(profileId), dataUrl);
    };

    const clearProfileAvatar = () => {
        const profileId = authState?.profile.id;
        if (!profileId) return;
        setProfileAvatarUrl(null);
        localStorage.removeItem(getAvatarStorageKey(profileId));
    };

    const uploadSkin = async (fileName: string, data: number[], model: 'classic' | 'slim' = 'classic') => {
        if (!authState) {
            throw new Error('You must be signed in to upload a skin.');
        }

        const result = await withTimeout(
            invoke<{ skinUrl?: string | null }>('auth_upload_skin', {
                mcAccessToken: authState.mcAccessToken,
                fileName,
                data,
                model
            }),
            30000,
            'Timed out while uploading skin.'
        );

        const nextState: AuthState = {
            ...authState,
            profile: {
                ...authState.profile,
                skinUrl: result?.skinUrl || authState.profile.skinUrl
            }
        };

        setAuthState(nextState);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
    };

    return {
        authState,
        profileAvatarUrl,
        deviceCode,
        loading,
        error,
        authDebug,
        startLogin,
        openLoginInBrowser: () => openLoginInBrowser(),
        cancelLogin,
        dismissAuthOverlay,
        clearError,
        logout,
        uploadSkin,
        setProfileAvatar,
        clearProfileAvatar
    };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const value = useAuthController();
    return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }

    return context;
}
