import { useNavigate } from 'react-router-dom';
import { Button, Card, ScreenHead } from '../design/components';
import { shortAddr } from '../lib/config';
import { removeContact } from '../lib/contacts';
import { useStore } from '../lib/store';

export function Contacts() {
  const { contacts, setContacts } = useStore();
  const navigate = useNavigate();
  return (
    <main className="screen">
      <ScreenHead title="Contacts" />
      {contacts.length === 0 ? (
        <p className="muted">After you pay someone, save them here to pay again without tapping.</p>
      ) : (
        contacts.map((c) => (
          <Card key={c.address}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong>{c.name}</strong>
                <br />
                <span className="mono">{shortAddr(c.address)}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => navigate('/send', { state: { address: c.address, name: c.name } })}
                >
                  Pay
                </Button>
                <Button
                  aria-label={`Remove ${c.name}`}
                  onClick={() => {
                    if (window.confirm(`Remove ${c.name}?`))
                      void removeContact(c.address).then(setContacts);
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </main>
  );
}
