-- =============================================================================
-- DEMO DATA — NOT the musical-goggles proprietary curriculum.
-- Generic, publicly known ballet terminology and widely taught corrections,
-- written for this prototype only. Safe to re-run (idempotent upserts by slug).
--
-- Camera detectors: only 3 rows carry a detector. These are CANDIDATES that
-- Phase 3 must validate on real footage; any that prove unreliable go back to NULL.
-- =============================================================================

insert into public.exercises (slug, name, french_term, german_term, level, category, description, position) values
  ('demi_plie',            'Demi-plié',              'demi-plié',               'halbe Kniebeuge',            'beginner',     'barre',        'Half bend of the knees with heels kept on the floor, in a turned-out position.', 10),
  ('grand_plie',           'Grand plié',             'grand plié',              'tiefe Kniebeuge',            'beginner',     'barre',        'Full bend of the knees; heels release only after passing demi-plié (except in second).', 20),
  ('battement_tendu',      'Tendu',                  'battement tendu',         'gestreckter Fuß am Boden',   'beginner',     'barre',        'The working foot slides out along the floor to a fully stretched point and returns.', 30),
  ('battement_degage',     'Dégagé',                 'battement dégagé',        'Battement jeté',             'beginner',     'barre',        'Like a tendu, brushed through the floor so the pointed foot leaves it slightly.', 40),
  ('rond_de_jambe_a_terre','Rond de jambe à terre',  'rond de jambe à terre',   'Beinkreis am Boden',         'beginner',     'barre',        'The working foot traces a half circle on the floor, front-side-back or reverse.', 50),
  ('port_de_bras',         'Port de bras',           'port de bras',            'Armführung',                 'beginner',     'port_de_bras', 'Carriage of the arms through the positions, coordinated with head and eyes.', 90),
  ('releve',               'Relevé',                 'relevé',                  'Erheben auf die Halbspitze', 'beginner',     'barre',        'Rise onto demi-pointe (or pointe), with the legs fully stretched.', 70),
  ('retire',               'Passé / retiré',         'retiré',                  'Passé',                      'beginner',     'barre',        'The working foot is drawn up the supporting leg to the knee, with the thigh rotated.', 60),
  ('grand_battement',      'Grand battement',        'grand battement',         'großer Beinwurf',            'intermediate', 'barre',        'A large, controlled throw of the stretched leg from the hip, lowered with control.', 80)
on conflict (slug) do update set
  name        = excluded.name,
  french_term = excluded.french_term,
  german_term = excluded.german_term,
  level       = excluded.level,
  category    = excluded.category,
  description = excluded.description,
  position    = excluded.position;

insert into public.exercise_aliases (exercise_id, alias, language)
select e.id, v.alias, v.language
  from (values
    ('demi_plie', 'plié', 'fr'),
    ('demi_plie', 'plie', 'en'),
    ('demi_plie', 'demi plie', 'en'),
    ('demi_plie', 'half bend', 'en'),
    ('demi_plie', 'Kniebeuge', 'de'),
    ('grand_plie', 'grand plie', 'en'),
    ('grand_plie', 'full plié', 'en'),
    ('grand_plie', 'deep bend', 'en'),
    ('battement_tendu', 'tendu', 'fr'),
    ('battement_tendu', 'tondue', 'en'),
    ('battement_degage', 'dégagé', 'fr'),
    ('battement_degage', 'degage', 'en'),
    ('battement_degage', 'jeté', 'fr'),
    ('battement_degage', 'glissé', 'fr'),
    ('rond_de_jambe_a_terre', 'rond de jambe', 'fr'),
    ('rond_de_jambe_a_terre', 'ronde de jambe', 'en'),
    ('rond_de_jambe_a_terre', 'leg circle', 'en'),
    ('port_de_bras', 'port de bra', 'en'),
    ('port_de_bras', 'arms', 'en'),
    ('port_de_bras', 'Arme', 'de'),
    ('releve', 'releve', 'en'),
    ('releve', 'rise', 'en'),
    ('releve', 'Halbspitze', 'de'),
    ('retire', 'passé', 'fr'),
    ('retire', 'passe', 'en'),
    ('retire', 'retire', 'en'),
    ('grand_battement', 'battement', 'fr'),
    ('grand_battement', 'big kick', 'en'),
    ('grand_battement', 'Beinwurf', 'de')
  ) as v(exercise_slug, alias, language)
  join public.exercises e on e.slug = v.exercise_slug
on conflict (exercise_id, lower(alias)) do update set language = excluded.language;

insert into public.corrections (exercise_id, slug, error_name, description, correction, cue_phrase, detector)
select e.id, v.slug, v.error_name, v.description, v.correction, v.cue_phrase, v.detector
  from (values
    -- demi-plié -------------------------------------------------------------
    ('demi_plie', 'knees_inward', 'Knees collapsing inward',
     'Knees fall in front of or inside the line of the toes as the knees bend.',
     'Track your knees over your toes', 'Knees over toes',
     '{"type":"geometric","rule":"knee_alignment","threshold":0.05,"min_duration_ms":300}'::jsonb),
    ('demi_plie', 'heels_lift', 'Heels lifting',
     'Heels come off the floor before the demi-plié reaches its depth.',
     'Keep your heels connected to the floor throughout the demi-plié', 'Keep heels connected',
     '{"type":"geometric","rule":"heel_lift","threshold":0.03,"min_duration_ms":300}'::jsonb),
    ('demi_plie', 'pelvis_tucked', 'Pelvis tucking under',
     'The tailbone tucks forward to gain depth, losing a neutral spine.',
     'Keep the pelvis neutral and lengthen the spine upward', 'Long spine, neutral pelvis', null),
    ('demi_plie', 'turnout_lost', 'Turnout lost',
     'The legs rotate inward from the hip while bending.',
     'Rotate the legs outward from the hip, not from the feet', 'Rotate from the hip', null),

    -- grand plié ------------------------------------------------------------
    ('grand_plie', 'heels_released_early', 'Heels released too early',
     'Heels lift before passing through a full demi-plié.',
     'Keep the heels down as long as possible; release only after the full demi-plié', 'Heels stay down longer', null),
    ('grand_plie', 'sitting_at_bottom', 'Sitting at the bottom',
     'Weight drops and rests at the deepest point instead of continuing the movement.',
     'Keep lifting up through the torso as you descend and rise without pausing', 'Lift out of the plié', null),
    ('grand_plie', 'back_arching', 'Back arching on the rise',
     'The lower back arches and ribs open when pushing up.',
     'Engage the abdominals and keep the ribs closed as you rise', 'Ribs closed', null),

    -- tendu -----------------------------------------------------------------
    ('battement_tendu', 'sickled_foot', 'Sickling the foot',
     'The ankle rolls so the foot curves inward at the point.',
     'Keep the ankle in line and point through the big toe', 'Don''t sickle', null),
    ('battement_tendu', 'weight_shift', 'Weight shifting onto the working leg',
     'The body leans toward the working foot as it extends.',
     'Keep your weight over the supporting leg', 'Stay over your standing leg', null),
    ('battement_tendu', 'working_knee_bent', 'Working knee bending',
     'The working knee softens instead of being fully stretched.',
     'Fully stretch the working knee from the start of the tendu', 'Long straight leg', null),
    ('battement_tendu', 'hip_lifting', 'Hip lifting with the leg',
     'The working hip rises, especially in tendu à la seconde.',
     'Keep both hips level and square to the front', 'Hips level', null),

    -- dégagé ----------------------------------------------------------------
    ('battement_degage', 'leg_too_high', 'Leg too high',
     'The leg is lifted well above the small height a dégagé requires.',
     'Brush the foot just off the floor; keep it low and quick', 'Low and sharp', null),
    ('battement_degage', 'no_brush', 'Lifting without brushing the floor',
     'The foot is lifted instead of brushed through the floor.',
     'Brush through the floor before the foot leaves it', 'Brush the floor', null),
    ('battement_degage', 'supporting_knee_soft', 'Supporting knee softening',
     'The standing knee bends slightly with each dégagé.',
     'Pull up through the supporting leg and keep the knee straight', 'Straight standing leg', null),

    -- rond de jambe à terre -------------------------------------------------
    ('rond_de_jambe_a_terre', 'hip_lifting_back', 'Working hip lifts at the back',
     'The pelvis twists or hikes as the leg passes behind.',
     'Keep the pelvis square as the leg travels to the back', 'Square hips', null),
    ('rond_de_jambe_a_terre', 'uneven_circle', 'Uneven half circle',
     'The foot cuts in or bulges out, so the path is not an even arc.',
     'Draw an even half circle: front, side and back at the same distance', 'Even half circle', null),
    ('rond_de_jambe_a_terre', 'turnout_lost_first', 'Turnout lost through first',
     'Rotation is lost when the leg passes through first position.',
     'Keep rotating from the hip as the foot passes through first', 'Rotate from the hip', null),

    -- port de bras ----------------------------------------------------------
    ('port_de_bras', 'shoulders_raised', 'Shoulders rising',
     'Shoulders lift toward the ears as the arms rise.',
     'Keep the shoulders down and the neck long while the arms lift', 'Shoulders down, neck long',
     '{"type":"geometric","rule":"shoulder_elevation","threshold":0.08,"min_duration_ms":400}'::jsonb),
    ('port_de_bras', 'elbows_dropped', 'Elbows dropping',
     'Elbows sag so the arm loses its rounded shape.',
     'Support the elbows so the arms stay softly rounded', 'Lift the elbows', null),
    ('port_de_bras', 'head_disconnected', 'Head not following the arms',
     'Head and eyes stay fixed instead of accompanying the movement.',
     'Let the head and eyes follow the hand through the port de bras', 'Eyes follow the hand', null),

    -- relevé ----------------------------------------------------------------
    ('releve', 'ankles_sickling', 'Ankles rolling out on relevé',
     'Weight falls onto the little toes and the ankle sickles.',
     'Rise through the second and third toes with the ankle aligned', 'Over the second toe', null),
    ('releve', 'dropping_down', 'Dropping down heavily',
     'The heels fall to the floor instead of lowering with control.',
     'Lower through the whole foot with control', 'Lower with control', null),
    ('releve', 'not_fully_up', 'Not rising fully onto demi-pointe',
     'The heel stays low so the rise is incomplete.',
     'Rise all the way to a high three-quarter pointe', 'All the way up', null),

    -- passé / retiré --------------------------------------------------------
    ('retire', 'foot_disconnected', 'Foot not connected to the knee',
     'The working toe floats away from the supporting leg.',
     'Place the toe at the supporting knee and keep it connected', 'Toe to knee', null),
    ('retire', 'hip_hiked', 'Working hip lifting',
     'The working hip rises as the foot travels up.',
     'Keep the hips level as the foot draws up the leg', 'Hips level', null),
    ('retire', 'knee_forward', 'Working knee falling forward',
     'The thigh rotates inward so the knee points to the front.',
     'Open the knee to the side by rotating from the hip', 'Knee to the side', null),

    -- grand battement -------------------------------------------------------
    ('grand_battement', 'torso_tipping', 'Torso tipping as the leg rises',
     'The upper body leans back or sideways to make room for the leg.',
     'Keep the torso still and let the leg rise independently', 'Still torso', null),
    ('grand_battement', 'uncontrolled_lowering', 'Leg dropping without control',
     'The leg falls down after the throw instead of being lowered.',
     'Lower the leg with control, resisting on the way down', 'Control the descent', null),
    ('grand_battement', 'bent_knee', 'Knee bending at the height',
     'The working or supporting knee bends at the top of the battement.',
     'Keep both legs fully stretched throughout', 'Long legs', null)
  ) as v(exercise_slug, slug, error_name, description, correction, cue_phrase, detector)
  join public.exercises e on e.slug = v.exercise_slug
on conflict (exercise_id, slug) do update set
  error_name  = excluded.error_name,
  description = excluded.description,
  correction  = excluded.correction,
  cue_phrase  = excluded.cue_phrase,
  detector    = excluded.detector;
