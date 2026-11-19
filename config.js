// Conexão com o Supabase. A chave anon é pública por natureza: os dados ficam
// protegidos pelo login e pelas regras do banco (supabase/schema.sql).
// Para voltar ao modo demonstração, deixe os dois campos vazios.
window.CRM_CONFIG = {
  supabaseUrl: 'https://dyxaihkuwunbfbogqbjr.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5eGFpaGt1d3VuYmZib2dxYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMTIzMzIsImV4cCI6MjExMDY4ODMzMn0.RuX7D5DJ5S1xV6EOs1Kwv77orWIng7irtWm0ygcYva0', // chave "anon public": pode ficar no site
  evento: 'Encontro de Alunos · Formação Corretor de Grãos Elite · 23/01/2027',
};
