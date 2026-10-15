import type { Lexicon } from './lexicon';

const cancelVerbs = ['cancelar', 'anular', 'dar de baja'];

export const ES: Lexicon = {
  lang: 'es',
  money: [
    'pagar', 'pagar ahora', 'comprar', 'comprar ahora', 'pedido', 'realizar pedido', 'hacer pedido',
    'finalizar compra', 'tramitar pedido', 'recargar', 'añadir fondos', 'número de tarjeta', 'transferir', 'donar',
  ],
  irreversible: [
    'eliminar', 'borrar', 'enviar', 'publicar', 'revocar', 'destruir', 'permanentemente', 'cerrar cuenta',
    'desactivar', 'darse de baja', 'para siempre', 'dar de baja la cuenta',
  ],
  auth: [
    'iniciar sesión', 'acceder', 'entrar', 'registrarse', 'contraseña', 'dos factores', 'autorizar',
    'cambiar de cuenta', 'código de verificación', 'código único', 'conceder acceso',
  ],
  consent: [
    'aceptar', 'aceptar todo', 'aceptar todas', 'acepto', 'estoy de acuerdo', 'permitir', 'permitir cookies',
    'permitir todas', 'consentir', 'suscribirse',
  ],
  dismissClose: [
    'cerrar', 'rechazar', 'rechazar todo', 'rechazar todas', 'no, gracias', 'no gracias', 'más tarde',
    'ahora no', 'omitir', 'descartar', '×',
  ],
  dismissVeto: [
    'aceptar', 'acepto', 'permitir', 'suscribirse', 'comprar', 'prueba', 'activar', 'mejorar', 'gestionar',
    'configuración', 'preferencias', 'personalizar',
  ],
  cancelContext: ['suscripción', 'pedido', 'cuenta', 'reserva', 'membresía', 'plan', 'contrato'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'no', 'volver'],
  confirmCue: [
    '¿estás seguro', 'estás seguro', 'está seguro', 'confirmar', 'no se puede deshacer', 'irreversible',
    'permanentemente', 'esta acción',
  ],
};
