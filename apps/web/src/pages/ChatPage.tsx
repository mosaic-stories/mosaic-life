import { useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import './ChatPage.css';

export function ChatPage() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(
    []
  );

  const handleSend = () => {
    if (!message.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: message }]);

    // Simulate AI response (stub)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm here to help you explore memories and create meaningful stories. This is a placeholder response - AI integration coming soon.",
        },
      ]);
    }, 500);

    setMessage('');
  };

  return (
    <PageLayout maxWidth="medium">
      <div className="chat-page">
        <div className="chat-header">
          <h1>AI Biographer</h1>
          <p className="chat-description">
            Let me help you explore memories and craft meaningful stories
          </p>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <h2>Start a conversation</h2>
              <p>Ask me to help you remember, reflect, or write about someone special</p>
              <div className="chat-suggestions">
                <button className="chat-suggestion">Tell me about a favorite memory</button>
                <button className="chat-suggestion">Help me describe a special moment</button>
                <button className="chat-suggestion">What should I write about?</button>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`chat-message chat-message-${msg.role}`}>
                <div className="chat-message-content">{msg.content}</div>
              </div>
            ))
          )}
        </div>

        <div className="chat-input-container">
          <Input
            fullWidth
            placeholder="Share what's on your mind..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend}>Send</Button>
        </div>
      </div>
    </PageLayout>
  );
}
