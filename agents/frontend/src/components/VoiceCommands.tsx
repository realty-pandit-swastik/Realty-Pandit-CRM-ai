/**
 * Voice AI Commands Component - Phase 4.4
 * Hands-free voice control for dashboard navigation using Web Speech API
 */

import { useState, useEffect, useRef } from 'react';

interface VoiceCommandsProps {
  onNavigate: (view: string) => void;
  currentView: string;
}

interface VoiceCommand {
  patterns: string[];
  action: string;
  description: string;
}

const VoiceCommands = ({ onNavigate, currentView }: VoiceCommandsProps) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [supported] = useState(() => Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  const [enabled, setEnabled] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [showHelp, setShowHelp] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const processCommandRef = useRef<(text: string) => void>(() => {});
  const speakRef = useRef<(text: string) => void>(() => {});

  // Voice command patterns mapped to navigation views
  const commands: VoiceCommand[] = [
    { patterns: ['dashboard', 'home', 'show dashboard', 'go to dashboard'], action: 'dashboard', description: 'Go to Dashboard' },
    { patterns: ['chats', 'messages', 'show chats', 'open chats'], action: 'chats', description: 'Open Chats' },
    { patterns: ['calendar', 'show calendar', 'open calendar', 'appointments'], action: 'calendar', description: 'Open Calendar' },
    { patterns: ['emails', 'show emails', 'open emails', 'mail'], action: 'emails', description: 'Open Emails' },
    { patterns: ['calls', 'call log', 'show calls', 'phone calls'], action: 'calls', description: 'Open Call Log' },
    { patterns: ['inventory', 'properties', 'show inventory', 'show properties'], action: 'inventory', description: 'View Inventory' },
    { patterns: ['map', 'property map', 'show map', 'location'], action: 'property-map', description: 'View Property Map' },
    { patterns: ['live status', 'status board', 'property status'], action: 'live-status', description: 'View Live Status' },
    { patterns: ['leads', 'external leads', 'show leads'], action: 'leads', description: 'View External Leads' },
    { patterns: ['partners', 'partner agents', 'show partners'], action: 'partners', description: 'View Partners' },
    { patterns: ['team', 'team management', 'show team'], action: 'team', description: 'View Team' },
    { patterns: ['reports', 'show reports', 'analytics'], action: 'reports', description: 'View Reports' },
    { patterns: ['ai agents', 'ai dashboard', 'show ai'], action: 'ai-dashboard', description: 'View AI Agents' },
    { patterns: ['agent logs', 'show logs', 'activity logs'], action: 'agent-logs', description: 'View Agent Logs' },
    { patterns: ['workflows', 'show workflows', 'automation'], action: 'workflows', description: 'View Workflows' },
    { patterns: ['marketing', 'campaigns', 'show marketing'], action: 'marketing', description: 'View Marketing' },
    { patterns: ['tasks', 'task board', 'show tasks', 'my tasks'], action: 'tasks', description: 'View Tasks' },
    { patterns: ['advanced analytics', 'analytics dashboard'], action: 'analytics', description: 'View Analytics' },
  ];

  // Initialize Web Speech API
  useEffect(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;

    if (!SpeechRecognition) {
      return;
    }

    synthRef.current = window.speechSynthesis;

    // Initialize recognition
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.lang = 'en-IN'; // Indian English

    // Build grammar from commands
    if (SpeechGrammarList) {
      const grammarList = new SpeechGrammarList();
      const allPatterns = commands.flatMap(c => c.patterns).join(' | ');
      const grammar = `#JSGF V1.0; grammar commands; public <command> = ${allPatterns};`;
      grammarList.addFromString(grammar, 1);
      recognition.grammars = grammarList;
    }

    recognition.onstart = () => {
      setListening(true);
      setFeedback('Listening...');
    };

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results[0]).map((r: any) => r.transcript.toLowerCase());
      const command = results[0];
      setTranscript(command);
      processCommandRef.current(command);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setListening(false);

      if (event.error === 'no-speech') {
        setFeedback('No speech detected. Try again.');
      } else if (event.error === 'not-allowed') {
        setFeedback('Microphone access denied.');
        setEnabled(false);
      } else {
        setFeedback(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (continuous && enabled) {
        // Auto-restart in continuous mode
        setTimeout(() => {
          try {
            recognition.start();
          } catch (err) {
            console.error('Failed to restart recognition:', err);
          }
        }, 1000);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [continuous, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Process voice command
  function processCommand(text: string) {
    const matched = commands.find(cmd =>
      cmd.patterns.some(pattern => text.includes(pattern))
    );

    if (matched) {
      setFeedback(`Navigating to ${matched.description}...`);
      speakRef.current(`Opening ${matched.description}`);
      setTimeout(() => {
        onNavigate(matched.action);
      }, 500);
    } else {
      setFeedback(`Command not recognized: "${text}"`);
      speakRef.current('Sorry, I did not understand that command.');
    }
  }

  // Text-to-speech feedback
  const speak = (text: string) => {
    if (!synthRef.current || volume === 0) return;

    // Cancel any ongoing speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.volume = volume;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Use Indian English voice if available
    const voices = synthRef.current.getVoices();
    const indianVoice = voices.find(v => v.lang === 'en-IN' || v.lang.startsWith('en-IN'));
    if (indianVoice) utterance.voice = indianVoice;

    synthRef.current.speak(utterance);
  };

  useEffect(() => {
    processCommandRef.current = processCommand;
    speakRef.current = speak;
  }, [processCommand]);

  // Start listening
  const startListening = () => {
    if (!recognitionRef.current || !enabled) return;

    try {
      recognitionRef.current.start();
      setTranscript('');
      setFeedback('');
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setFeedback('Already listening or microphone busy.');
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      setFeedback('Stopped listening.');
    }
  };

  // Toggle voice control
  const toggleVoiceControl = () => {
    if (enabled) {
      stopListening();
      setEnabled(false);
      setFeedback('Voice control disabled.');
    } else {
      setEnabled(true);
      setFeedback('Voice control enabled. Click mic to start.');
      speak('Voice control enabled');
    }
  };

  if (!supported) {
    return (
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
        backgroundColor: 'var(--error-bg)', border: '1px solid var(--error-border)',
        borderRadius: '12px', padding: '16px', maxWidth: '320px',
        color: 'var(--error-text)', fontSize: '13px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <strong>Voice Commands Not Supported</strong>
        </div>
        <p style={{ margin: 0 }}>
          Your browser doesn't support Web Speech API. Please use Chrome, Edge, or Safari.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: '90px', right: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
    }}>
      {/* Help Panel */}
      {showHelp && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          borderRadius: '12px', padding: '16px', width: '320px', maxHeight: '400px',
          overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700 }}>
              🎤 Voice Commands
            </h3>
            <button
              onClick={() => setShowHelp(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '18px', padding: '4px',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>
              Voice Volume
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={continuous}
                onChange={(e) => setContinuous(e.target.checked)}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Continuous Listening
              </span>
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px' }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
              Available Commands:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {commands.slice(0, 10).map((cmd, idx) => (
                <div key={idx} style={{ fontSize: '12px' }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    "{cmd.patterns[0]}"
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {cmd.description}
                  </div>
                </div>
              ))}
              {commands.length > 10 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                  + {commands.length - 10} more commands
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback Panel */}
      {enabled && (transcript || feedback) && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          borderRadius: '12px', padding: '12px 16px', width: '280px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {transcript && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>
                You said:
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
                "{transcript}"
              </div>
            </div>
          )}
          {feedback && (
            <div style={{ color: listening ? '#3b82f6' : 'var(--text-secondary)', fontSize: '12px' }}>
              {feedback}
            </div>
          )}
        </div>
      )}

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Help Button */}
        <button
          onClick={() => setShowHelp(!showHelp)}
          title="View available commands"
          style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transition: 'all 0.2s',
          }}
        >
          ❓
        </button>

        {/* Power Button */}
        <button
          onClick={toggleVoiceControl}
          title={enabled ? 'Disable voice control' : 'Enable voice control'}
          style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: enabled ? '#22c55e' : 'var(--bg-secondary)',
            border: enabled ? 'none' : '1px solid var(--border-secondary)',
            color: enabled ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transition: 'all 0.2s',
          }}
        >
          {enabled ? '⚡' : '🔌'}
        </button>

        {/* Microphone Button */}
        <button
          onClick={listening ? stopListening : startListening}
          disabled={!enabled}
          title={listening ? 'Stop listening' : 'Start listening'}
          style={{
            width: '56px', height: '56px', borderRadius: '50%',
            backgroundColor: listening ? '#ef4444' : enabled ? '#3b82f6' : 'var(--bg-tertiary)',
            border: 'none', color: '#fff', cursor: enabled ? 'pointer' : 'not-allowed',
            fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: listening ? '0 4px 16px rgba(239, 68, 68, 0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
            animation: listening ? 'pulse 1.5s ease-in-out infinite' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {listening ? '⏹️' : '🎤'}
        </button>
      </div>

      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4); transform: scale(1); }
          50% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.6); transform: scale(1.05); }
        }
      `}</style>

      {/* Current View Indicator */}
      {enabled && (
        <div style={{
          position: 'absolute', top: '-40px', right: '0',
          backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          borderRadius: '8px', padding: '6px 12px', fontSize: '11px',
          color: 'var(--text-muted)', whiteSpace: 'nowrap',
        }}>
          Current: {commands.find(c => c.action === currentView)?.description || currentView}
        </div>
      )}
    </div>
  );
};

export default VoiceCommands;
