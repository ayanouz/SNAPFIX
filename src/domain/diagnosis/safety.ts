import type {
  Category,
  DiagnosisAnalysis,
  SafetyLevel,
  SafetyWarning,
  WarningCode,
} from './schema';

/**
 * Deterministic safety policy. This module runs independently of the AI prompt
 * and is re-applied to every model response. The client mirrors the same rules
 * as defence in depth; the server copy is authoritative.
 */

type HazardRule = {
  code: WarningCode;
  severity: SafetyLevel;
  professionalRequired: boolean;
  stopGuidance: boolean;
  patterns: RegExp[];
  message: string;
  escalation?: string;
};

export type SafetyAssessment = {
  riskLevel: SafetyLevel;
  professionalRequired: boolean;
  stopGuidance: boolean;
  warnings: SafetyWarning[];
  matchedCodes: WarningCode[];
};

const HAZARD_RULES: HazardRule[] = [
  {
    code: 'gas_leak',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\bgas\s*(leak|leaking|smell|smells|odou?r)\b/i,
      /\b(smell|smells|smelling|odou?r|leak|leaking)\s+(of\s+)?gas\b/i,
      /\b(fuite|odeur|sentir|sent)\s+(de\s+)?gaz\b/i,
      /(رائحة|تسريب|تسرب)\s*(ال)?غاز/i,
      /\bgaz\b.*\b(fuite|odeur)\b/i,
    ],
    message:
      'A gas smell or leak is a potential emergency. Do not operate switches, light flames, or attempt repairs.',
    escalation:
      'Leave the area, avoid flames and electrical switches, ventilate only if safe, and contact your gas supplier or emergency services from a safe location.',
  },
  {
    code: 'carbon_monoxide',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\bcarbon\s*monoxide\b/i,
      /\bco\s*(alarm|detector)\b/i,
      /\bmonoxyde\s+de\s+carbone\b/i,
      /(أول\s*أكسيد\s*الكربون|أحادي\s*أكسيد\s*الكربون)/i,
    ],
    message: 'Carbon monoxide may be present. This is a life-safety emergency, not a repair task.',
    escalation:
      'Move everyone to fresh air, call emergency services, and do not re-enter until professionals confirm it is safe.',
  },
  {
    code: 'fire_smoke',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(fire|flames?|on fire)\b(?!\s*(extinguisher|alarm|detector|station|place|door))/i,
      /\b(smoke|smoking)\b(?!\s*(alarm|detector))/i,
      /\b(incendie|flammes?|en feu)\b/i,
      /\bfum[ée]e\b/i,
      /(حريق|نار|لهب|دخان)/i,
    ],
    message:
      'Fire, flames, or smoke were mentioned. Stop repair work and prioritise evacuation and emergency help.',
    escalation:
      'Evacuate, call emergency services, and do not use water on electrical fires. Only use a suitable extinguisher if it is safe to do so.',
  },
  {
    code: 'electrical_hazard',
    severity: 'high',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(exposed|bare|live|loose)\s+(wire|wires|wiring|cable)\b/i,
      /\b(electric(al)?\s*shock|electrocut(ed|ion)|got\s+shocked)\b/i,
      /\b(sparks?|sparking|arcing|short\s*circuit)\b/i,
      /\b(burning|burnt|scorch(ed|ing))\s+(smell|plastic|wire)\b/i,
      /\bwater\b.{0,30}\b(outlet|socket|switch|electric|wiring)\b/i,
      /\b(fil|fils|c[âa]ble)\s+(d[ée]nud[ée]|expos[ée])\b/i,
      /\b(choc|d[ée]charge)\s+[ée]lectrique\b/i,
      /\b[ée]tincelles?\b/i,
      /(سلك|أسلاك)\s*(مكشوف|عار)/i,
      /(صعقة|صدمة)\s*كهربائية/i,
      /(شرر|ماس كهربائي)/i,
    ],
    message:
      'Possible electrical hazard. Do not touch exposed conductors or work on energised equipment.',
    escalation:
      'Switch off power at the main breaker only if you can do so without touching damaged wiring. Keep others away and contact a qualified electrician.',
  },
  {
    code: 'high_voltage',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(microwave|microwave oven)\b.{0,80}\b(open|repair|capacitor|not heating|no heat)\b/i,
      /\b(capacitor|high[-\s]?voltage|inverter|solar\s+panel|ev\s+battery)\b/i,
      /\b(micro-ondes|condensateur|haute\s+tension)\b/i,
      /(ميكروويف|مكثف|جهد\s*عالي)/i,
    ],
    message: 'This equipment can store dangerous high voltage even after it is unplugged.',
    escalation:
      'Do not open the enclosure. High-voltage components require a qualified technician.',
  },
  {
    code: 'structural_hazard',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(sagging|collaps(ed|ing)|caving)\s+(ceiling|roof|floor|wall)\b/i,
      /\b(structural|load[-\s]?bearing|foundation)\b.{0,40}\b(crack|damage|failure|problem)\b/i,
      /\b(plafond|toit|mur|plancher)\b.{0,30}\b(s'affaisse|effondr|fissure\s+profonde)\b/i,
      /(سقف|جدار|أرضية).{0,30}(تشقق|انهيار|هبوط)/i,
    ],
    message: 'Structural damage may be present. This is not safe to assess from a photo alone.',
    escalation:
      'Keep people away from the affected area and contact a qualified structural engineer or your building manager.',
  },
  {
    code: 'chemical_hazard',
    severity: 'high',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(asbestos|amiante|أسبست|حرير\s*صخري)\b/i,
      /\b(chemical|fumes?|toxic|corrosive|caustic)\b/i,
      /\b(produit\s+chimique|vapeurs?\s+toxiques|corrosif)\b/i,
      /(مواد\s*كيميائية|أبخرة\s*سامة|تآكل)/i,
      /\b(mix(ing)?|m[ée]lang(e|er))\b.{0,30}\b(bleach|ammonia|javel|ammoniaque)\b/i,
    ],
    message:
      'Possible chemical exposure. Avoid inhaling fumes or mixing products, and do not continue repairs.',
    escalation:
      'Ventilate only if safe, leave the area, and contact poison control or emergency services if anyone is exposed.',
  },
  {
    code: 'pressure_system',
    severity: 'high',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(pressuri[sz]ed|steam|pressure\s+(vessel|tank|system))\b/i,
      /\b(boiler|water\s+heater|chauffe[-\s]?eau|chaudi[èe]re)\b.{0,80}\b(repair|open|leak|noise|pressure|fuit|r[ée]par)\b/i,
      /\b(sous\s+pression|vapeur|chauffe-eau)\b/i,
      /(ضغط|بخار|سخان\s*الماء|غلاية)/i,
    ],
    message: 'Pressurised or heated-water systems can release scalding water or steam.',
    escalation:
      'Do not open the system. Isolate it only through a safe external control and contact a qualified plumber or heating technician.',
  },
  {
    code: 'vehicle_safety',
    severity: 'critical',
    professionalRequired: true,
    stopGuidance: true,
    patterns: [
      /\b(brake|braking|steering|airbag)\b.{0,60}\b(fail|failure|fault|problem|soft|stuck|warning|light)\b/i,
      /\b(frein|direction|airbag)\b.{0,50}\b(d[ée]faill|probl[èe]me|voyant|mou)\b/i,
      /(فرامل|مكابح|توجيه|وسادة\s*هوائية).{0,40}(عطل|مشكلة|تحذير)/i,
    ],
    message: 'Brake, steering, or airbag faults are safety-critical vehicle systems.',
    escalation: 'Do not drive the vehicle. Arrange professional inspection or recovery.',
  },
];

const UNSAFE_INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(bypass|disable|remove|defeat|jumper)\b.{0,30}\b(safety|interlock|switch|fuse|ground|earth|breaker)\b/i,
  /\b(work|working|operate|test)\b.{0,20}\b(live|energised|energized|powered)\b/i,
  /\bopen\b.{0,20}\b(gas|refrigerant|pressuri[sz]ed)\b.{0,20}\b(valve|line|system)\b/i,
  /\b(remove|disconnect)\b.{0,20}\b(ground|earth|bonding)\b/i,
  /\b(water|extinguish)\b.{0,20}\b(electrical|live)\b.{0,20}\b(fire|equipment)\b/i,
  /\b(skip|ignore)\b.{0,20}\b(safety|warning|lockout)\b/i,
  /\b(d[ée]sactiv|contourn|bypass)\w*\b.{0,25}\b(s[ée]curit|verrou|disjoncteur|terre)\b/i,
  /(تجاوز|تعطيل|تجاهل).{0,25}(أمان|قاطع|تأريض)/i,
];

const TYPE_RULES: { pattern: RegExp; severity: SafetyLevel; message: string; code: WarningCode }[] =
  [
    {
      pattern: /\b(gas\s+(boiler|water\s+heater|furnace)|chaudi[èe]re\s+[àa]\s+gaz)\b/i,
      severity: 'high',
      message: 'Gas-fired heating equipment requires a qualified technician for internal work.',
      code: 'pressure_system',
    },
    {
      pattern: /\b(space\s+heater|radiateur\s+soufflant)\b/i,
      severity: 'high',
      message: 'Portable heaters can present fire and electrical risks when opened or repaired.',
      code: 'electrical_hazard',
    },
    {
      pattern: /\b(microwave|micro-ondes|ميكروويف)\b/i,
      severity: 'high',
      message: 'Microwave enclosures contain high-voltage components and should not be opened.',
      code: 'high_voltage',
    },
    {
      pattern: /\b(smoke\s+(alarm|detector)|d[ée]tecteur\s+de\s+fum[ée]e)\b/i,
      severity: 'high',
      message:
        'Life-safety alarms should be tested according to the manufacturer instructions; internal repair is not user serviceable.',
      code: 'professional_required',
    },
  ];

const SEVERITY_ORDER: Record<SafetyLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function highestRisk(...levels: SafetyLevel[]): SafetyLevel {
  return levels.reduce<SafetyLevel>(
    (highest, level) => (SEVERITY_ORDER[level] > SEVERITY_ORDER[highest] ? level : highest),
    'low',
  );
}

export function normalizeForMatching(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function containsUnsafeInstruction(text: string): boolean {
  const normalized = normalizeForMatching(text);
  return UNSAFE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assessSafety(input: {
  text: string;
  category?: Category;
  identifiedType?: string | null;
}): SafetyAssessment {
  const text = normalizeForMatching(input.text);
  const identified = normalizeForMatching(input.identifiedType ?? '');
  const matched: HazardRule[] = [];

  for (const rule of HAZARD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      matched.push(rule);
    }
  }

  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(identified) || rule.pattern.test(text)) {
      matched.push({
        code: rule.code,
        severity: rule.severity,
        professionalRequired: rule.severity === 'high' || rule.severity === 'critical',
        stopGuidance: rule.severity === 'high' || rule.severity === 'critical',
        patterns: [],
        message: rule.message,
      });
    }
  }

  const riskLevel = highestRisk('low', ...matched.map((rule) => rule.severity));
  const professionalRequired = matched.some((rule) => rule.professionalRequired);
  const warnings: SafetyWarning[] = matched.map((rule) => ({
    code: rule.code,
    severity: rule.severity,
    message: rule.message,
    source: 'rule',
  }));

  return {
    riskLevel,
    professionalRequired,
    stopGuidance: matched.some((rule) => rule.stopGuidance),
    warnings,
    matchedCodes: [...new Set(matched.map((rule) => rule.code))],
  };
}

function warningKey(warning: SafetyWarning): string {
  return `${warning.code}:${warning.severity}:${warning.message}`;
}

function uniqueWarnings(warnings: SafetyWarning[]): SafetyWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = warningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function professionalStep(locale: string): DiagnosisAnalysis['next_steps'][number] {
  const messages: Record<string, { title: string; description: string }> = {
    fr: {
      title: 'Faire appel à un professionnel qualifié',
      description:
        'Arrêtez le diagnostic ou la réparation et contactez un professionnel qualifié pour vérifier le problème sur place.',
    },
    ar: {
      title: 'استعن بفني مؤهل',
      description: 'أوقف التشخيص أو الإصلاح واتصل بفني مؤهل لفحص المشكلة في الموقع.',
    },
    en: {
      title: 'Contact a qualified professional',
      description:
        'Stop diagnosis or repair work and arrange an on-site inspection by a qualified professional.',
    },
  };
  const message = messages[locale] ?? messages.en!;
  return {
    id: 'safe-professional-escalation',
    title: message.title,
    description: message.description,
    type: 'professional',
    safe: true,
  };
}

function stopStep(locale: string): DiagnosisAnalysis['next_steps'][number] {
  const messages: Record<string, { title: string; description: string }> = {
    fr: {
      title: 'Mettre la zone en sécurité',
      description:
        'Éloignez les personnes de la zone. Ne touchez pas aux câbles, au gaz ou aux pièces sous tension. Suivez les consignes de sécurité affichées.',
    },
    ar: {
      title: 'أمّن المنطقة',
      description:
        'أبعد الأشخاص عن المنطقة. لا تلمس الأسلاك أو الغاز أو الأجزاء التي عليها تيار كهربائي. اتبع تحذيرات السلامة المعروضة.',
    },
    en: {
      title: 'Make the area safe',
      description:
        'Keep people away from the area. Do not touch wiring, gas fittings, or energised parts. Follow the safety guidance shown.',
    },
  };
  const message = messages[locale] ?? messages.en!;
  return {
    id: 'safe-stop-work',
    title: message.title,
    description: message.description,
    type: 'check',
    safe: true,
  };
}

/**
 * Applies rules to a parsed model assessment and returns a schema-valid result.
 * Dangerous DIY instructions are removed. Professional-only cases retain only
 * safe checks and an escalation step.
 */
export function applySafetyPolicy(
  analysis: DiagnosisAnalysis,
  context: { text: string; locale: string; category?: Category },
): DiagnosisAnalysis {
  const ruleAssessment = assessSafety({
    text: `${context.text} ${analysis.observations.map((entry) => entry.description).join(' ')} ${analysis.possible_causes
      .map((entry) => `${entry.title} ${entry.explanation}`)
      .join(' ')}`,
    category: context.category ?? analysis.item.category,
    identifiedType: analysis.item.identified_type,
  });

  const modelWarnings = analysis.safety.warnings.filter(
    (warning) =>
      !warning.message || !containsUnsafeInstruction(warning.message) || warning.source === 'rule',
  );
  const warnings = uniqueWarnings([...ruleAssessment.warnings, ...modelWarnings]);

  const unsafeStepsRemoved = [
    ...analysis.repair_options.flatMap((option) => option.steps),
    ...analysis.next_steps,
  ].some((entry) =>
    containsUnsafeInstruction(
      'instructions' in entry ? entry.instructions : `${entry.title} ${entry.description}`,
    ),
  );

  if (unsafeStepsRemoved) {
    warnings.push({
      code: 'unsafe_instruction_removed',
      severity: 'high',
      message:
        'Some unsafe instructions were removed from the AI response. Do not attempt procedures that bypass safety devices.',
      source: 'rule',
    });
  }

  const riskLevel = highestRisk(analysis.safety.risk_level, ruleAssessment.riskLevel);
  const professionalRequired =
    analysis.safety.professional_required ||
    ruleAssessment.professionalRequired ||
    unsafeStepsRemoved ||
    riskLevel === 'high' ||
    riskLevel === 'critical';
  const stopGuidance = analysis.safety.stop_guidance || professionalRequired;

  if (professionalRequired) {
    warnings.push({
      code: 'professional_required',
      severity: riskLevel === 'low' ? 'high' : riskLevel,
      message:
        'This situation should be checked by a qualified professional. SNAPFIX will not provide DIY repair steps for it.',
      source: 'rule',
    });
  }

  if (analysis.summary.confidence < 0.45) {
    warnings.push({
      code: 'uncertain_evidence',
      severity: 'low',
      message:
        'The available evidence is limited, so the possible causes below are hypotheses rather than a confirmed diagnosis.',
      source: 'rule',
    });
  }

  const safeNextSteps = analysis.next_steps.filter(
    (step) =>
      !containsUnsafeInstruction(`${step.title} ${step.description}`) &&
      (!professionalRequired ||
        step.type === 'professional' ||
        (step.type === 'check' && step.safe)),
  );

  let nextSteps = safeNextSteps;
  if (professionalRequired) {
    nextSteps = [
      ...nextSteps.filter((step) => step.type !== 'professional'),
      professionalStep(context.locale),
    ];
    if (!nextSteps.some((step) => step.id === 'safe-stop-work')) {
      nextSteps = [stopStep(context.locale), ...nextSteps];
    }
    nextSteps = nextSteps.slice(0, 8);
  }

  const repairOptions = professionalRequired
    ? []
    : analysis.repair_options
        .map((option) => ({
          ...option,
          steps: option.steps.filter(
            (step) => !containsUnsafeInstruction(`${step.title} ${step.instructions}`),
          ),
        }))
        .filter((option) => option.steps.length > 0);

  const repairability = professionalRequired
    ? {
        verdict:
          analysis.repairability.verdict === 'replace'
            ? ('replace' as const)
            : ('professional' as const),
        rationale:
          analysis.repairability.verdict === 'replace'
            ? analysis.repairability.rationale
            : context.locale === 'fr'
              ? 'La sécurité exige une intervention professionnelle. Aucune procédure de réparation guidée n’est fournie.'
              : context.locale === 'ar'
                ? 'تتطلب السلامة تدخلاً مهنياً. لا تتوفر خطوات إصلاح موجّهة لهذه الحالة.'
                : 'Safety requires professional involvement. No guided DIY repair procedure is provided.',
      }
    : analysis.repairability;

  const limitations = [...analysis.limitations];
  const requiredLimitations: Record<string, string[]> = {
    en: [
      'Photo-based analysis cannot confirm hidden mechanical, electrical, or structural faults.',
      'Cost estimates, when shown, are ranges based on verified reference data and are not quotes.',
    ],
    fr: [
      'Une analyse par photo ne peut pas confirmer les défauts mécaniques, électriques ou structurels cachés.',
      'Les estimations de coût, lorsqu’elles sont affichées, sont des fourchettes fondées sur des données vérifiées, pas des devis.',
    ],
    ar: [
      'لا يمكن للتحليل عبر الصورة تأكيد الأعطال الميكانيكية أو الكهربائية أو الإنشائية المخفية.',
      'تقديرات التكلفة، عند عرضها، هي نطاقات مبنية على بيانات مرجعية موثقة وليست عروض أسعار.',
    ],
  };
  for (const limitation of requiredLimitations[context.locale] ?? requiredLimitations.en!) {
    if (!limitations.includes(limitation)) limitations.push(limitation);
  }

  const escalation =
    ruleAssessment.matchedCodes.length > 0
      ? (HAZARD_RULES.find((rule) => ruleAssessment.matchedCodes.includes(rule.code))?.escalation ??
        analysis.safety.escalation)
      : analysis.safety.escalation;

  return {
    ...analysis,
    safety: {
      risk_level: riskLevel,
      professional_required: professionalRequired,
      stop_guidance: stopGuidance,
      warnings: uniqueWarnings(warnings),
      escalation,
    },
    next_steps: nextSteps,
    repair_options: repairOptions,
    repairability,
    limitations: limitations.slice(0, 10),
  };
}

export function riskDescriptionKey(level: SafetyLevel): string {
  return `safety.risk_${level}`;
}

export const SAFETY_WARNING_I18N: Record<WarningCode, string> = {
  gas_leak: 'safety.warnings.gas_leak',
  carbon_monoxide: 'safety.warnings.carbon_monoxide',
  fire_smoke: 'safety.warnings.fire_smoke',
  electrical_hazard: 'safety.warnings.electrical_hazard',
  structural_hazard: 'safety.warnings.structural_hazard',
  chemical_hazard: 'safety.warnings.chemical_hazard',
  pressure_system: 'safety.warnings.pressure_system',
  vehicle_safety: 'safety.warnings.vehicle_safety',
  high_voltage: 'safety.warnings.high_voltage',
  unsafe_instruction_removed: 'safety.warnings.unsafe_instruction_removed',
  professional_required: 'safety.warnings.professional_required',
  uncertain_evidence: 'safety.warnings.uncertain_evidence',
  photo_limitation: 'safety.warnings.photo_limitation',
  demo_mode: 'safety.warnings.demo_mode',
};
