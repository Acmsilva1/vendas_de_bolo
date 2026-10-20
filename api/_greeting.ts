export function whatsappGreeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23'
  }).format(now));
  const greeting = hour < 12 ? 'Bom dia! ☀️' : hour < 18 ? 'Boa tarde! 🌤️' : 'Boa noite! 🌙✨';
  return `${greeting} Já vi o seu pedido e estou providenciando tudo. Aguarde sua entrega, por gentileza. 🧁📦💖`;
}
