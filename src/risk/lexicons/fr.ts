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
