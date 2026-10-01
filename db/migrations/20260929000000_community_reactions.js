// Multi-reactions on community items: a member can give several DIFFERENT
// reactions to the same item (🔥👏💪🏁). Existing single cheers become a '🔥'.
exports.up = async function up(knex) {
  await knex.schema.alterTable('community_cheers', (t) => {
    t.string('reaction', 8).notNullable().defaultTo('🔥');
    t.dropUnique(['item_key', 'user_id'], 'community_cheers_item_key_user_id_unique');
    t.unique(['item_key', 'user_id', 'reaction']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('community_cheers', (t) => {
    t.dropUnique(['item_key', 'user_id', 'reaction'], 'community_cheers_item_key_user_id_reaction_unique');
    t.unique(['item_key', 'user_id']);
    t.dropColumn('reaction');
  });
};