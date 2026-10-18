import type { Lexicon } from './lexicon';

const cancelVerbs = ['annuler', 'résilier', 'mettre fin'];

export const FR: Lexicon = {
  lang: 'fr',
  money: [
    'payer', 'payer maintenant', 'acheter', 'acheter maintenant', 'commander', 'passer la commande',
    'valider la commande', 'paiement', 'recharger', 'ajouter des fonds', 'numéro de carte', 'virement', 'faire un don',
  ],
  irreversible: [
    'supprimer', 'effacer', 'envoyer', 'publier', 'révoquer', 'détruire', 'définitivement', 'fermer le compte',
    'désactiver', 'se désabonner', 'se désinscrire', 'irréversible',
  ],
  auth: [
    'se connecter', 'connexion', 'identifiant', "s'inscrire", 'mot de passe', 'double authentification',
    'autoriser', 'changer de compte', 'code de vérification', 'code à usage unique', "donner l'accès",
    'me connecter', 'connectez-vous',
  ],
  authDefer: [
    'se connecter plus tard', 'me connecter plus tard', "s'inscrire plus tard", 'ignorer la connexion',
    'passer la connexion', "ignorer l'inscription", "passer l'inscription", 'sans se connecter', 'sans me connecter',
    'sans connexion', "sans s'inscrire", 'sans inscription', 'sans compte', 'sans créer de compte', "en tant qu'invité",
    "en tant qu'invitée", 'comme invité',
    'connectez-vous plus tard',
  ],
  consent: [
    'accepter', 'tout accepter', "j'accepte", 'accepter et continuer', 'consentir', 'autoriser les cookies',
    'tout autoriser', "d'accord", 'je consens', "s'abonner",
  ],
  dismissClose: [
    'fermer', 'refuser', 'tout refuser', 'non merci', 'non, merci', 'plus tard', 'pas maintenant', 'ignorer',
    'passer', 'continuer sans accepter', '×',
  ],
  dismissVeto: [
    'accepter', "d'accord", 'autoriser', "s'abonner", 'acheter', 'essai', 'activer', 'mettre à niveau', 'gérer',
    'paramètres', 'préférences', 'personnaliser',
  ],
  cancelContext: ['abonnement', 'commande', 'compte', 'réservation', 'adhésion', 'forfait', 'contrat'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'non', 'retour'],
  confirmCue: [
    'êtes-vous sûr', 'êtes-vous sûre', 'êtes vous sûr', 'confirmer', 'irréversible', 'définitivement',
    'ne peut pas être annulée', 'cette action',
  ],
};
