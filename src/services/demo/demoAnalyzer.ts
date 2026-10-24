import {
  DIAGNOSIS_PROMPT_VERSION,
  DIAGNOSIS_SCHEMA_VERSION,
  analysisSchema,
  type Category,
  type DiagnosisAnalysis,
  type RepairOption,
} from '@/domain/diagnosis/schema';
import { applySafetyPolicy, assessSafety } from '@/domain/diagnosis/safety';
import { unavailableEstimate, ESTIMATE_REASONS } from '@/domain/diagnosis/cost';

/**
 * Deterministic demo analyzer.
 *
 * It NEVER claims to see the photo. It converts the user's description into
 * clearly labelled hypotheses, safe checks, and conservative guidance. This
 * makes the complete product flow testable without an AI account while being
 * explicit that no vision model is running.
 */

export type DemoAnalysisInput = {
  category: Category;
  description: string;
  brand?: string | null;
  model?: string | null;
  errorCode?: string | null;
  imageCount: number;
  locale: string;
  currency: string;
};

type Lang = 'en' | 'fr' | 'ar';
type Localized = Record<Lang, string>;

function langOf(locale: string): Lang {
  return locale === 'fr' || locale === 'ar' ? locale : 'en';
}

function pick(value: Localized, locale: string): string {
  return value[langOf(locale)];
}

const L = (en: string, fr: string, ar: string): Localized => ({ en, fr, ar });

const CATEGORY_NAMES: Record<Category, Localized> = {
  appliance: L('household appliance', 'appareil ménager', 'جهاز منزلي'),
  plumbing: L('plumbing fixture', 'installation de plomberie', 'تركيبة سباكة'),
  electrical: L('electrical fixture', 'installation électrique', 'تركيبة كهربائية'),
  heating_cooling: L(
    'heating or cooling system',
    'système de chauffage ou climatisation',
    'نظام تدفئة أو تبريد',
  ),
  furniture: L('piece of furniture', 'meuble', 'قطعة أثاث'),
  walls_floors: L('wall or floor surface', 'mur ou sol', 'جدار أو أرضية'),
  electronics: L('electronic device', 'appareil électronique', 'جهاز إلكتروني'),
  other: L('household item', 'objet domestique', 'عنصر منزلي'),
};

const TYPE_HINTS: { pattern: RegExp; name: Localized }[] = [
  {
    pattern: /washing machine|lave-linge|غسالة/i,
    name: L('washing machine', 'lave-linge', 'غسالة'),
  },
  {
    pattern: /dishwasher|lave-vaisselle|غسالة أطباق/i,
    name: L('dishwasher', 'lave-vaisselle', 'غسالة أطباق'),
  },
  {
    pattern: /fridge|refrigerator|réfrigérateur|frigo|ثلاجة/i,
    name: L('refrigerator', 'réfrigérateur', 'ثلاجة'),
  },
  { pattern: /oven|four|فرن/i, name: L('oven', 'four', 'فرن') },
  { pattern: /dryer|sèche-linge|مجفف/i, name: L('dryer', 'sèche-linge', 'مجفف ملابس') },
  { pattern: /toilet|wc|toilettes|مرحاض/i, name: L('toilet', 'toilettes', 'مرحاض') },
  { pattern: /sink|évier|lavabo|حوض/i, name: L('sink', 'évier', 'حوض') },
  { pattern: /water heater|chauffe-eau|سخان/i, name: L('water heater', 'chauffe-eau', 'سخان ماء') },
  { pattern: /boiler|chaudière|غلاية/i, name: L('boiler', 'chaudière', 'غلاية') },
  {
    pattern: /air conditioner|climatiseur|clim|مكيف/i,
    name: L('air conditioner', 'climatiseur', 'مكيف هواء'),
  },
  { pattern: /microwave|micro-ondes|ميكروويف/i, name: L('microwave', 'micro-ondes', 'ميكروويف') },
  { pattern: /chair|chaise|كرسي/i, name: L('chair', 'chaise', 'كرسي') },
  { pattern: /door|porte|باب/i, name: L('door', 'porte', 'باب') },
  { pattern: /radiator|radiateur|مشعاع|رادياتور/i, name: L('radiator', 'radiateur', 'مشعاع') },
  { pattern: /phone|smartphone|téléphone|هاتف/i, name: L('phone', 'téléphone', 'هاتف') },
  { pattern: /laptop|ordinateur|حاسوب/i, name: L('laptop', 'ordinateur portable', 'حاسوب محمول') },
];

type CauseTemplate = {
  title: Localized;
  explanation: Localized;
  confidence: number;
  verification: Localized;
  repair?: {
    title: Localized;
    summary: Localized;
    difficulty: RepairOption['difficulty'];
    duration: { min: number; max: number };
    tools: Localized[];
    materials: Localized[];
    steps: { title: Localized; instructions: Localized; warning?: Localized }[];
  };
};

const GENERIC_CAUSES: Record<Category, CauseTemplate[]> = {
  appliance: [
    {
      title: L(
        'Blocked filter or airflow path',
        'Filtre ou circulation d’air obstrué',
        'فلتر أو مسار هواء مسدود',
      ),
      explanation: L(
        'Lint, food residue, or dust can restrict normal operation. This is a common, user-serviceable cause on many appliances.',
        'Les peluches, résidus ou poussières peuvent gêner le fonctionnement normal. C’est une cause fréquente accessible à l’utilisateur sur de nombreux appareils.',
        'قد تؤدي الوبر أو بقايا الطعام أو الغبار إلى إعاقة التشغيل الطبيعي. وهذا سبب شائع يمكن للمستخدم فحصه في أجهزة كثيرة.',
      ),
      confidence: 0.42,
      verification: L(
        'Check only the filter or vent the manufacturer designed to be accessed by the user, with the appliance switched off.',
        'Vérifiez uniquement le filtre ou l’aération prévus pour l’utilisateur, appareil éteint.',
        'افحص فقط الفلتر أو فتحة التهوية المخصصة للمستخدم، مع إطفاء الجهاز.',
      ),
      repair: {
        title: L(
          'Clean the accessible filter',
          'Nettoyer le filtre accessible',
          'تنظيف الفلتر المتاح',
        ),
        summary: L(
          'Remove and clean only the filter or vent the manufacturer marks as user-serviceable.',
          'Retirez et nettoyez uniquement le filtre ou l’aération indiqués comme accessibles par le fabricant.',
          'أزل ونظف فقط الفلتر أو فتحة التهوية التي يحددها المصنع على أنها متاحة للمستخدم.',
        ),
        difficulty: 'easy',
        duration: { min: 10, max: 25 },
        tools: [L('Soft brush', 'Brosse douce', 'فرشاة ناعمة'), L('Cloth', 'Chiffon', 'قطعة قماش')],
        materials: [L('Warm water', 'Eau tiède', 'ماء فاتر')],
        steps: [
          {
            title: L('Isolate the appliance', 'Mettre l’appareil hors tension', 'افصل الجهاز'),
            instructions: L(
              'Switch the appliance off and unplug it, or switch off the dedicated circuit at the breaker. Do not pull on a damaged cable.',
              'Éteignez l’appareil et débranchez-le, ou coupez le circuit dédié au disjoncteur. Ne tirez pas sur un câble endommagé.',
              'أطفئ الجهاز وافصله من الكهرباء، أو أوقف الدائرة المخصصة من القاطع. لا تسحب كابلًا تالفًا.',
            ),
          },
          {
            title: L(
              'Remove the accessible filter',
              'Retirer le filtre accessible',
              'أزل الفلتر المتاح',
            ),
            instructions: L(
              'Follow the manufacturer diagram. Do not force covers, remove screws that are not part of the filter access, or open sealed areas.',
              'Suivez le schéma du fabricant. Ne forcez pas les capots, ne retirez pas de vis hors de l’accès au filtre et n’ouvrez pas les zones scellées.',
              'اتبع مخطط المصنع. لا تفرض فتح الأغطية أو تفك براغي غير مخصصة للفلتر أو تفتح مناطق محكمة.',
            ),
          },
          {
            title: L('Clean and dry', 'Nettoyer et sécher', 'نظف وجفف'),
            instructions: L(
              'Rinse away loose debris, let the part dry completely, and refit it exactly as shown in the manual.',
              'Rincez les résidus, laissez sécher complètement et remontez la pièce comme indiqué dans le manuel.',
              'اشطف البقايا واتركها تجف تمامًا ثم أعد تركيبها كما هو موضح في الدليل.',
            ),
            warning: L(
              'Never put water inside an electrical enclosure. If water reaches wiring or the motor, stop.',
              'Ne mettez jamais d’eau dans un compartiment électrique. Si l’eau atteint le câblage ou le moteur, arrêtez.',
              'لا تضع الماء داخل حاوية كهربائية. إذا وصل الماء إلى الأسلاك أو المحرك، توقف.',
            ),
          },
          {
            title: L('Test carefully', 'Tester prudemment', 'اختبر بحذر'),
            instructions: L(
              'Reconnect, run a short cycle, and stop immediately if you see smoke, sparks, a burning smell, or water near electrical parts.',
              'Rebranchez, lancez un cycle court et arrêtez immédiatement en cas de fumée, d’étincelles, d’odeur de brûlé ou d’eau près des parties électriques.',
              'أعد التوصيل وشغّل دورة قصيرة وتوقف فورًا عند رؤية دخان أو شرر أو رائحة احتراق أو ماء قرب أجزاء كهربائية.',
            ),
          },
        ],
      },
    },
    {
      title: L(
        'Worn seal, hose, or external connection',
        'Joint, tuyau ou raccord externe usé',
        'مانع تسرب أو خرطوم أو وصلة خارجية متآكلة',
      ),
      explanation: L(
        'Vibration and age can loosen external hoses or wear door seals. This hypothesis fits leaks or intermittent operation.',
        'Les vibrations et l’âge peuvent desserrer les tuyaux externes ou user les joints de porte. Cette hypothèse correspond aux fuites ou au fonctionnement intermittent.',
        'قد تؤدي الاهتزازات والقدم إلى إرخاء الخراطيم الخارجية أو تآكل موانع تسرب الباب. تناسب هذه الفرضية التسريبات أو التشغيل المتقطع.',
      ),
      confidence: 0.34,
      verification: L(
        'With the appliance off, inspect external hoses and seals for cracks, loose clamps, or mineral buildup. Do not open internal panels.',
        'Appareil éteint, inspectez les tuyaux et joints externes pour fissures, colliers desserrés ou dépôt calcaire. N’ouvrez pas les panneaux internes.',
        'أوقف الجهاز وافحص الخراطيم وموانع التسرب الخارجية بحثًا عن تشققات أو مشابك مرتخية أو ترسبات معدنية. لا تفتح الألواح الداخلية.',
      ),
    },
    {
      title: L(
        'Sensor or control fault',
        'Défaut de capteur ou de commande',
        'عطل في المستشعر أو لوحة التحكم',
      ),
      explanation: L(
        'An error code or inconsistent behaviour may point to a sensor or control board. This needs model-specific diagnostics.',
        'Un code d’erreur ou un comportement incohérent peut indiquer un capteur ou une carte de commande. Cela nécessite un diagnostic spécifique au modèle.',
        'قد يشير رمز خطأ أو سلوك غير متسق إلى مستشعر أو لوحة تحكم. يتطلب ذلك تشخيصًا خاصًا بالطراز.',
      ),
      confidence: 0.28,
      verification: L(
        'Record the exact error code and check the manufacturer manual. Do not test internal electronics or bypass error protections.',
        'Notez le code d’erreur exact et consultez le manuel du fabricant. Ne testez pas l’électronique interne et ne contournez pas les protections.',
        'سجّل رمز الخطأ الدقيق وافحص دليل المصنع. لا تختبر الإلكترونيات الداخلية ولا تتجاوز حمايات الأخطاء.',
      ),
    },
  ],
  plumbing: [
    {
      title: L(
        'Loose fitting or worn washer',
        'Raccord desserré ou joint usé',
        'وصلة مرتخية أو حلقة مانعة للتسرب متآكلة',
      ),
      explanation: L(
        'Water often escapes at a threaded connection, compression fitting, or worn washer before a larger pipe fault is involved.',
        'L’eau s’échappe souvent d’un raccord fileté, d’un raccord à compression ou d’un joint usé avant qu’une panne de canalisation plus importante ne soit en cause.',
        'غالبًا ما يتسرب الماء عند وصلة ملولبة أو وصلة ضغط أو حلقة متآكلة قبل وجود عطل أكبر في الأنبوب.',
      ),
      confidence: 0.48,
      verification: L(
        'Dry the area, place a container underneath, and observe exactly where the first drop appears. Close a labelled local isolation valve only if it turns easily.',
        'Séchez la zone, placez un récipient dessous et observez l’endroit exact de la première goutte. Fermez un robinet d’isolement local étiqueté uniquement s’il tourne facilement.',
        'جفف المنطقة وضع وعاءً تحتها وراقب المكان الذي تظهر فيه أول قطرة. أغلق صمام العزل المحلي المحدد فقط إذا كان يدور بسهولة.',
      ),
      repair: {
        title: L(
          'Tighten an accessible connection',
          'Resserrer un raccord accessible',
          'شد وصلة يمكن الوصول إليها',
        ),
        summary: L(
          'A gentle tighten or washer replacement at an accessible, low-pressure connection can stop a minor drip.',
          'Un léger resserrage ou le remplacement d’un joint sur un raccord accessible à basse pression peut arrêter un suintement mineur.',
          'قد يؤدي الشد اللطيف أو استبدال الحلقة في وصلة متاحة منخفضة الضغط إلى إيقاف تنقيط بسيط.',
        ),
        difficulty: 'easy',
        duration: { min: 10, max: 30 },
        tools: [
          L('Adjustable wrench', 'Clé réglable', 'مفتاح قابل للتعديل'),
          L('Dry cloth', 'Chiffon sec', 'قطعة قماش جافة'),
        ],
        materials: [L('Replacement washer', 'Joint de rechange', 'حلقة بديلة')],
        steps: [
          {
            title: L('Isolate the water', 'Couper l’eau', 'أوقف الماء'),
            instructions: L(
              'Close the nearest labelled isolation valve. If there is no isolation valve or it will not turn by hand, stop and call a plumber.',
              'Fermez le robinet d’isolement le plus proche. S’il n’y en a pas ou s’il ne tourne pas à la main, arrêtez et appelez un plombier.',
              'أغلق أقرب صمام عزل محدد. إذا لم يوجد أو لم يكن يدور يدويًا، توقف واتصل بسباك.',
            ),
          },
          {
            title: L(
              'Dry and identify the drip',
              'Sécher et localiser la fuite',
              'جفف وحدد مصدر التنقيط',
            ),
            instructions: L(
              'Dry the connection, then reopen the water briefly and watch for the first drop. Do not dismantle a pipe under pressure.',
              'Séchez le raccord, rouvrez brièvement l’eau et repérez la première goutte. Ne démontez pas un tuyau sous pression.',
              'جفف الوصلة ثم أعد فتح الماء لفترة قصيرة وراقب أول قطرة. لا تفك أنبوبًا تحت الضغط.',
            ),
          },
          {
            title: L('Tighten gently', 'Resserrer doucement', 'اشدد بلطف'),
            instructions: L(
              'Tighten no more than a quarter turn. Stop if the fitting moves as a whole or feels brittle. Never force a plastic nut.',
              'Ne serrez pas de plus d’un quart de tour. Arrêtez si le raccord bouge entièrement ou semble cassant. Ne forcez jamais un écrou en plastique.',
              'لا تشدد أكثر من ربع دورة. توقف إذا تحركت الوصلة ككتلة أو بدت هشة. لا تفرض مطلقًا صامولة بلاستيكية.',
            ),
            warning: L(
              'If the pipe is damaged, water is near electrical equipment, or the leak is from a wall or ceiling, stop and seek a professional.',
              'Si le tuyau est endommagé, que l’eau est près d’un équipement électrique ou que la fuite vient d’un mur ou du plafond, arrêtez et faites appel à un professionnel.',
              'إذا كان الأنبوب تالفًا أو كان الماء قرب معدات كهربائية أو كان التسرب من جدار أو سقف، توقف واستعن بمهني.',
            ),
          },
        ],
      },
    },
    {
      title: L('Partial blockage', 'Bouchon partiel', 'انسداد جزئي'),
      explanation: L(
        'Slow drainage can come from hair, soap residue, or food debris in a user-accessible trap.',
        'Un écoulement lent peut venir de cheveux, de résidus de savon ou de débris dans un siphon accessible.',
        'قد ينتج بطء التصريف عن الشعر أو بقايا الصابون أو الطعام في مصيدة يمكن الوصول إليها.',
      ),
      confidence: 0.4,
      verification: L(
        'Check whether only one fixture drains slowly. Do not remove a trap containing standing water over electrical equipment.',
        'Vérifiez si un seul appareil s’écoule lentement. Ne démontez pas un siphon contenant de l’eau stagnante au-dessus d’un équipement électrique.',
        'تحقق مما إذا كانت قطعة واحدة فقط تصرف ببطء. لا تفك مصيدة تحتوي ماءً راكدًا فوق معدات كهربائية.',
      ),
    },
    {
      title: L(
        'Worn internal valve or pipe damage',
        'Robinet interne usé ou tuyau endommagé',
        'صمام داخلي متآكل أو أنبوب تالف',
      ),
      explanation: L(
        'Recurring leaks, low pressure across several fixtures, or damp walls can indicate an internal fault that needs on-site assessment.',
        'Des fuites récurrentes, une basse pression sur plusieurs appareils ou des murs humides peuvent indiquer un défaut interne nécessitant une évaluation sur place.',
        'قد تشير التسريبات المتكررة أو انخفاض الضغط في عدة تركيبات أو الجدران الرطبة إلى عطل داخلي يحتاج إلى تقييم في الموقع.',
      ),
      confidence: 0.24,
      verification: L(
        'Note damp patches and pressure changes. Do not open walls or disturb a sealed pipe run yourself.',
        'Notez les traces d’humidité et les variations de pression. N’ouvrez pas les murs et ne dérangez pas une canalisation scellée.',
        'لاحظ بقع الرطوبة وتغيرات الضغط. لا تفتح الجدران ولا تعبث بمسار أنبوب محكم.',
      ),
    },
  ],
  electrical: [
    {
      title: L(
        'Loose lamp, plug, or user-serviceable connection',
        'Lampe, fiche ou raccord accessible desserré',
        'مصباح أو قابس أو وصلة متاحة مرتخية',
      ),
      explanation: L(
        'A loose bulb, plug, or external adapter is a common cause of intermittent power. Internal wiring should not be touched.',
        'Une ampoule, une fiche ou un adaptateur externe desserré est une cause fréquente d’alimentation intermittente. Le câblage interne ne doit pas être touché.',
        'قد يكون المصباح أو القابس أو المحول الخارجي المرتخي سببًا شائعًا لانقطاع الطاقة. لا يجب لمس الأسلاك الداخلية.',
      ),
      confidence: 0.36,
      verification: L(
        'Switch off at the wall and inspect only external plugs and lamp fittings. If you see heat damage, exposed wire, or smell burning, stop.',
        'Coupez au mur et inspectez uniquement les fiches et luminaires externes. En cas de dommage thermique, fil dénudé ou odeur de brûlé, arrêtez.',
        'أوقف الكهرباء من المفتاح وافحص فقط القوابس والمصابيح الخارجية. إذا رأيت ضررًا حراريًا أو سلكًا مكشوفًا أو رائحة احتراق، توقف.',
      ),
      repair: {
        title: L(
          'Replace an external bulb or adapter',
          'Remplacer une ampoule ou un adaptateur externe',
          'استبدال مصباح أو محول خارجي',
        ),
        summary: L(
          'Only replace a user-serviceable bulb or external adapter with the power isolated and the correct rating.',
          'Remplacez uniquement une ampoule ou un adaptateur externe accessible, hors tension et avec la bonne caractéristique.',
          'استبدل فقط مصباحًا أو محولًا خارجيًا متاحًا للمستخدم مع فصل الكهرباء وبالقدرة الصحيحة.',
        ),
        difficulty: 'easy',
        duration: { min: 5, max: 15 },
        tools: [L('Dry hands', 'Mains sèches', 'يدان جافتان')],
        materials: [
          L(
            'Correct-rated bulb or adapter',
            'Ampoule ou adaptateur de bonne puissance',
            'مصباح أو محول بالقدرة الصحيحة',
          ),
        ],
        steps: [
          {
            title: L('Isolate the circuit', 'Couper le circuit', 'افصل الدائرة'),
            instructions: L(
              'Switch off the wall switch and, if needed, the labelled breaker. Confirm the light or device is off before touching anything.',
              'Coupez l’interrupteur mural et, si nécessaire, le disjoncteur étiqueté. Vérifiez que la lumière ou l’appareil est hors tension avant de toucher.',
              'أطفئ مفتاح الحائط وعند الحاجة القاطع المحدد. تأكد من انطفاء الضوء أو الجهاز قبل اللمس.',
            ),
          },
          {
            title: L(
              'Replace the external part',
              'Remplacer la pièce externe',
              'استبدل الجزء الخارجي',
            ),
            instructions: L(
              'Let a hot bulb cool, then replace it with the same rating. Do not force a plug, remove a cover, or open a fixture.',
              'Laissez refroidir une ampoule chaude puis remplacez-la par une de même caractéristique. Ne forcez pas une fiche, ne retirez pas de cache et n’ouvrez pas un luminaire.',
              'اترك المصباح الساخن يبرد ثم استبدله بنفس القدرة. لا تفرض القابس ولا تزل الغطاء ولا تفتح التركيبة.',
            ),
            warning: L(
              'If the fitting is warm, buzzing, scorched, or tripping the breaker, stop and call an electrician.',
              'Si le luminaire est chaud, bourdonne, est brûlé ou fait disjoncter, arrêtez et appelez un électricien.',
              'إذا كانت التركيبة ساخنة أو تطن أو محروقة أو تفصل القاطع، توقف واتصل بكهربائي.',
            ),
          },
        ],
      },
    },
    {
      title: L(
        'Tripped breaker or overloaded circuit',
        'Disjoncteur déclenché ou circuit surchargé',
        'قاطع مفصول أو دائرة محملة أكثر من اللازم',
      ),
      explanation: L(
        'Several high-power devices on one circuit can trip a breaker. A breaker that trips repeatedly is a safety concern, not something to override.',
        'Plusieurs appareils puissants sur un même circuit peuvent déclencher un disjoncteur. Un disjoncteur qui déclenche à répétition est un problème de sécurité, à ne pas contourner.',
        'قد تؤدي عدة أجهزة عالية القدرة على دائرة واحدة إلى فصل القاطع. القاطع الذي يفصل بشكل متكرر مشكلة سلامة ولا يجب تجاوزه.',
      ),
      confidence: 0.3,
      verification: L(
        'Note which devices are on the circuit. Never tape a breaker on, replace it with a larger one, or reset it while standing on a wet floor.',
        'Notez les appareils sur le circuit. Ne bloquez jamais un disjoncteur, ne le remplacez pas par un plus gros et ne le réarmez pas sur un sol mouillé.',
        'لاحظ الأجهزة على الدائرة. لا تثبت القاطع أبدًا ولا تستبدله بآخر أكبر ولا تعيد ضبطه على أرضية مبللة.',
      ),
    },
    {
      title: L(
        'Internal wiring or fixture fault',
        'Défaut de câblage ou de luminaire interne',
        'عطل في الأسلاك أو التركيبة الداخلية',
      ),
      explanation: L(
        'Buzzing, warmth, scorch marks, or flickering in several fixtures can indicate an internal wiring fault. This requires a qualified electrician.',
        'Un bourdonnement, de la chaleur, des marques de brûlure ou un scintillement sur plusieurs luminaires peuvent indiquer un défaut de câblage interne. Un électricien qualifié est nécessaire.',
        'قد يشير الطنين أو الحرارة أو آثار الاحتراق أو الوميض في عدة تركيبات إلى عطل داخلي في الأسلاك. يتطلب كهربائيًا مؤهلًا.',
      ),
      confidence: 0.22,
      verification: L(
        'Do not open switches, outlets, or ceiling roses. Keep the circuit off and arrange professional inspection if anything is warm or damaged.',
        'N’ouvrez pas les interrupteurs, prises ou boîtes de plafond. Laissez le circuit coupé et faites inspecter par un professionnel si quelque chose est chaud ou endommagé.',
        'لا تفتح المفاتيح أو المقابس أو علب السقف. أبقِ الدائرة مطفأة واتصل بمهني للفحص إذا كان أي شيء ساخنًا أو تالفًا.',
      ),
    },
  ],
  heating_cooling: [
    {
      title: L(
        'Blocked filter or restricted airflow',
        'Filtre obstrué ou circulation d’air limitée',
        'فلتر مسدود أو تدفق هواء محدود',
      ),
      explanation: L(
        'Dust and blocked vents reduce heating or cooling performance. The filter and external vents are often user-serviceable.',
        'La poussière et les grilles bouchées réduisent les performances. Le filtre et les grilles externes sont souvent accessibles à l’utilisateur.',
        'يقلل الغبار وانسداد الفتحات من أداء التدفئة أو التبريد. غالبًا ما يكون الفلتر والفتحات الخارجية متاحين للمستخدم.',
      ),
      confidence: 0.45,
      verification: L(
        'With the system off, check the user-accessible filter and confirm vents are not blocked by furniture. Do not open gas-fired equipment.',
        'Système éteint, vérifiez le filtre accessible et assurez-vous que les grilles ne sont pas bloquées. N’ouvrez pas un équipement à gaz.',
        'أوقف النظام وافحص الفلتر المتاح وتأكد من عدم انسداد الفتحات بالأثاث. لا تفتح معدات تعمل بالغاز.',
      ),
      repair: {
        title: L(
          'Clean or replace the accessible filter',
          'Nettoyer ou remplacer le filtre accessible',
          'تنظيف أو استبدال الفلتر المتاح',
        ),
        summary: L(
          'Clean the filter the manufacturer exposes to users; never open the sealed refrigerant or combustion section.',
          'Nettoyez le filtre prévu pour l’utilisateur ; n’ouvrez jamais la partie réfrigérant ou combustion scellée.',
          'نظف الفلتر المخصص للمستخدم؛ لا تفتح قسم التبريد أو الاحتراق المحكم أبدًا.',
        ),
        difficulty: 'easy',
        duration: { min: 10, max: 30 },
        tools: [L('Vacuum with soft brush', 'Aspirateur avec brosse douce', 'مكنسة بفرشاة ناعمة')],
        materials: [],
        steps: [
          {
            title: L('Switch off the system', 'Éteindre le système', 'أوقف النظام'),
            instructions: L(
              'Turn the system off at the thermostat or controller. For a gas appliance, do not remove covers or touch gas piping.',
              'Éteignez le système au thermostat ou au contrôleur. Pour un appareil à gaz, ne retirez pas les capots et ne touchez pas aux tuyaux de gaz.',
              'أوقف النظام من منظم الحرارة أو وحدة التحكم. بالنسبة لجهاز غاز، لا تزل الأغطية ولا تلمس أنابيب الغاز.',
            ),
          },
          {
            title: L('Clean the filter', 'Nettoyer le filtre', 'نظف الفلتر'),
            instructions: L(
              'Remove the filter following the manufacturer instructions, vacuum loose dust, and refit it in the correct orientation.',
              'Retirez le filtre selon les instructions du fabricant, aspirez la poussière et remontez-le dans le bon sens.',
              'أزل الفلتر وفق تعليمات المصنع وامتص الغبار وأعد تركيبه بالاتجاه الصحيح.',
            ),
            warning: L(
              'Stop if you smell gas, see soot, or the equipment is hot, sparking, or leaking water.',
              'Arrêtez si vous sentez le gaz, voyez de la suie, ou si l’équipement est chaud, produit des étincelles ou fuit.',
              'توقف إذا شممت غازًا أو رأيت سخامًا أو كان الجهاز ساخنًا أو يشرر أو يسرب ماء.',
            ),
          },
        ],
      },
    },
    {
      title: L(
        'Thermostat or sensor calibration issue',
        'Problème de thermostat ou de capteur',
        'مشكلة في منظم الحرارة أو المستشعر',
      ),
      explanation: L(
        'A thermostat reading that does not match the room, or a system that short-cycles, may indicate a sensor or control fault.',
        'Un thermostat qui ne correspond pas à la pièce, ou un système qui s’enclenche par courts cycles, peut indiquer un capteur ou une commande défaillante.',
        'قد يشير منظم حرارة لا يطابق الغرفة أو نظام يعمل بدورات قصيرة إلى عطل في المستشعر أو وحدة التحكم.',
      ),
      confidence: 0.28,
      verification: L(
        'Compare the thermostat with a separate thermometer and check the batteries. Do not bypass a safety sensor or force a gas valve.',
        'Comparez le thermostat avec un thermomètre séparé et vérifiez les piles. Ne contournez pas un capteur de sécurité et ne forcez pas une vanne de gaz.',
        'قارن منظم الحرارة بمقياس حرارة منفصل وافحص البطاريات. لا تتجاوز مستشعر أمان ولا تفرض صمام غاز.',
      ),
    },
    {
      title: L(
        'Refrigerant or combustion-system fault',
        'Défaut de réfrigérant ou de combustion',
        'عطل في مادة التبريد أو نظام الاحتراق',
      ),
      explanation: L(
        'Low refrigerant, a blocked condensate drain, or a combustion fault requires gauges, leak detection, or flue analysis. These are professional-only checks.',
        'Un manque de réfrigérant, un condensat bouché ou un défaut de combustion nécessite des manomètres, une détection de fuite ou une analyse des fumées. Ces contrôles sont réservés aux professionnels.',
        'قد يتطلب نقص مادة التبريد أو انسداد تصريف التكثيف أو عطل الاحتراق أجهزة قياس أو كشف تسرب أو تحليل المداخن. هذه فحوصات للمهنيين فقط.',
      ),
      confidence: 0.2,
      verification: L(
        'Do not add refrigerant, open the sealed circuit, or adjust combustion settings. Arrange a qualified technician.',
        'N’ajoutez pas de réfrigérant, n’ouvrez pas le circuit scellé et ne réglez pas la combustion. Faites appel à un technicien qualifié.',
        'لا تضف مادة تبريد ولا تفتح الدائرة المحكمة ولا تعدل إعدادات الاحتراق. اتصل بفني مؤهل.',
      ),
    },
  ],
  furniture: [
    {
      title: L('Loose fastener or joint', 'Fixation ou assemblage desserré', 'مثبت أو وصلة مرتخية'),
      explanation: L(
        'Repeated movement can loosen screws, cam locks, or bolts. This is usually a straightforward, low-risk repair.',
        'Les mouvements répétés peuvent desserrer vis, excentriques ou boulons. C’est généralement une réparation simple et à faible risque.',
        'قد تؤدي الحركة المتكررة إلى إرخاء البراغي أو أقفال الكام أو الصواميل. غالبًا ما يكون هذا إصلاحًا بسيطًا منخفض المخاطر.',
      ),
      confidence: 0.5,
      verification: L(
        'Gently rock the item with a hand on a stable part. Stop if a leg, frame member, or load-bearing joint is cracked or moves as a unit.',
        'Balancez doucement l’objet en tenant une partie stable. Arrêtez si un pied, un montant ou un assemblage porteur est fissuré ou bouge en bloc.',
        'حرّك القطعة بلطف مع تثبيت جزء مستقر. توقف إذا كان أحد الأرجل أو الإطار أو وصلة حاملة متصدعًا أو يتحرك ككتلة.',
      ),
      repair: {
        title: L(
          'Tighten accessible fasteners',
          'Resserrer les fixations accessibles',
          'شد المثبتات المتاحة',
        ),
        summary: L(
          'Re-tighten accessible screws or cam locks. Do not drill into a load-bearing member or glue a structural crack without advice.',
          'Resserrez les vis ou excentriques accessibles. Ne percez pas un élément porteur et ne collez pas une fissure structurelle sans avis.',
          'أعد شد البراغي أو أقفال الكام المتاحة. لا تحفر في عضو حامل ولا تلصق تشققًا إنشائيًا دون استشارة.',
        ),
        difficulty: 'easy',
        duration: { min: 10, max: 30 },
        tools: [
          L('Screwdriver', 'Tournevis', 'مفك براغي'),
          L('Hex key', 'Clé Allen', 'مفتاح سداسي'),
        ],
        materials: [
          L(
            'Matching screws or cam lock',
            'Vis ou excentrique compatible',
            'براغي أو قفل كام مطابق',
          ),
        ],
        steps: [
          {
            title: L(
              'Empty and stabilise the furniture',
              'Vider et stabiliser le meuble',
              'أفرغ الأثاث وثبته',
            ),
            instructions: L(
              'Remove loose items and ask someone to steady the furniture. Do not climb on or under a piece that may collapse.',
              'Retirez les objets instables et demandez à quelqu’un de stabiliser le meuble. Ne montez pas sur un meuble susceptible de céder.',
              'أزل العناصر غير الثابتة واطلب من شخص تثبيت الأثاث. لا تصعد على قطعة قد تنهار.',
            ),
          },
          {
            title: L(
              'Tighten and check alignment',
              'Resserrer et vérifier l’alignement',
              'اشدد وتحقق من المحاذاة',
            ),
            instructions: L(
              'Tighten accessible fasteners by hand or with the correct tool. Stop if the material splits or the joint remains loose.',
              'Resserrez les fixations à la main ou avec l’outil adapté. Arrêtez si le matériau se fend ou si l’assemblage reste lâche.',
              'اشدد المثبتات يدويًا أو بالأداة الصحيحة. توقف إذا انشق الخشب أو بقي المفصل مرتخيًا.',
            ),
            warning: L(
              'Do not use damaged furniture for climbing, storage, or supporting heavy loads until it is stable.',
              'N’utilisez pas un meuble endommagé pour grimper, stocker ou supporter des charges lourdes avant stabilisation.',
              'لا تستخدم الأثاث التالف للصعود أو التخزين أو حمل أوزان ثقيلة حتى يصبح مستقرًا.',
            ),
          },
        ],
      },
    },
    {
      title: L(
        'Worn hinge or moving part',
        'Charnière ou pièce mobile usée',
        'مفصلة أو جزء متحرك متآكل',
      ),
      explanation: L(
        'Sagging doors or squeaking moving parts can come from loose hinges, worn bushings, or missing bumpers.',
        'Des portes affaissées ou des pièces grinçantes peuvent venir de charnières desserrées, bagues usées ou butées manquantes.',
        'قد ينتج انخفاض الأبواب أو صرير الأجزاء المتحركة عن مفصلات مرتخية أو حلقات متآكلة أو مصدات مفقودة.',
      ),
      confidence: 0.4,
      verification: L(
        'Check hinge screws and alignment. Do not remove a door that could fall; support it first.',
        'Vérifiez les vis et l’alignement des charnières. Ne retirez pas une porte susceptible de tomber ; soutenez-la d’abord.',
        'افحص براغي المفصلة والمحاذاة. لا تزل بابًا قد يسقط؛ ادعمه أولًا.',
      ),
    },
    {
      title: L(
        'Material fatigue or structural damage',
        'Fatigue du matériau ou dommage structurel',
        'إجهاد المادة أو تلف إنشائي',
      ),
      explanation: L(
        'Cracks in a load-bearing frame or joints that stay loose after tightening may need a professional repair or replacement.',
        'Les fissures dans un cadre porteur ou les assemblages qui restent lâches après serrage peuvent nécessiter une réparation professionnelle ou un remplacement.',
        'قد تحتاج التشققات في الإطار الحامل أو الوصلات التي تبقى مرتخية بعد الشد إلى إصلاح مهني أو استبدال.',
      ),
      confidence: 0.22,
      verification: L(
        'Note where the movement originates. Do not use the item for climbing or heavy loads if the frame is compromised.',
        'Notez l’origine du mouvement. N’utilisez pas l’objet pour grimper ou supporter de lourdes charges si le cadre est fragilisé.',
        'لاحظ مصدر الحركة. لا تستخدم القطعة للصعود أو الأحمال الثقيلة إذا كان الإطار متضررًا.',
      ),
    },
  ],
  walls_floors: [
    {
      title: L(
        'Worn sealant, grout, or paint',
        'Mastic, joint ou peinture usé',
        'مادة سد أو جص أو طلاء متآكل',
      ),
      explanation: L(
        'Cracked sealant around a bath or shower can let water into a surface. Cosmetic cracks in paint are usually harmless.',
        'Un mastic fissuré autour d’une baignoire peut laisser entrer l’eau. Les fissures de peinture sont généralement sans danger.',
        'قد يسمح مانع التسرب المتشقق حول الحمام بدخول الماء إلى السطح. تشققات الطلاء التجميلية عادة غير ضارة.',
      ),
      confidence: 0.4,
      verification: L(
        'Check whether the area is wet or soft. Do not sand, cut, or drill a wall that may contain asbestos, wiring, or pipes.',
        'Vérifiez si la zone est humide ou molle. Ne poncez, coupez ou percez pas un mur pouvant contenir de l’amiante, des câbles ou des tuyaux.',
        'تحقق مما إذا كانت المنطقة رطبة أو طرية. لا تصنفر أو تقطع أو تحفر جدارًا قد يحتوي أسبست أو أسلاكًا أو أنابيب.',
      ),
      repair: {
        title: L(
          'Refresh accessible sealant',
          'Rafraîchir un mastic accessible',
          'تجديد مادة سد متاحة',
        ),
        summary: L(
          'Remove old flexible sealant from a dry, accessible edge and apply a suitable bathroom sealant.',
          'Retirez l’ancien mastic d’un bord sec et accessible et appliquez un mastic de salle de bain adapté.',
          'أزل مادة السد القديمة من حافة جافة يمكن الوصول إليها وضع مادة سد مناسبة للحمام.',
        ),
        difficulty: 'easy',
        duration: { min: 30, max: 90 },
        tools: [
          L('Sealant gun', 'Pistolet à mastic', 'مسدس سد'),
          L('Scraper', 'Grattoir', 'مكشطة'),
        ],
        materials: [L('Bathroom sealant', 'Mastic salle de bain', 'مادة سد للحمام')],
        steps: [
          {
            title: L(
              'Check for moisture damage',
              'Vérifier les dégâts d’humidité',
              'تحقق من أضرار الرطوبة',
            ),
            instructions: L(
              'If the surface is soft, crumbly, blackened, or water is actively entering, stop. This may be a hidden leak or structural issue.',
              'Si la surface est molle, friable, noircie ou si l’eau entre activement, arrêtez. Il peut s’agir d’une fuite cachée ou d’un problème structurel.',
              'إذا كان السطح طريًا أو متفتتًا أو مسودًا أو يدخل الماء بنشاط، توقف. قد يكون تسربًا مخفيًا أو مشكلة إنشائية.',
            ),
          },
          {
            title: L(
              'Remove and replace the sealant',
              'Retirer et remplacer le mastic',
              'أزل واستبدل مادة السد',
            ),
            instructions: L(
              'Work on a dry surface, remove loose sealant, and follow the product instructions for curing and ventilation.',
              'Travaillez sur une surface sèche, retirez le mastic instable et suivez les instructions du produit pour le séchage et la ventilation.',
              'اعمل على سطح جاف وأزل مادة السد غير الثابتة واتبع تعليمات المنتج للتجفيف والتهوية.',
            ),
            warning: L(
              'Do not cover active water damage or mould with new sealant. Fix the source first.',
              'Ne masquez pas une infiltration active ou de la moisissure avec un nouveau mastic. Traitez d’abord la source.',
              'لا تغطِ تسربًا نشطًا أو عفنًا بمادة سد جديدة. عالج المصدر أولًا.',
            ),
          },
        ],
      },
    },
    {
      title: L(
        'Water ingress or hidden leak',
        'Infiltration d’eau ou fuite cachée',
        'تسرب ماء أو رطوبة مخفية',
      ),
      explanation: L(
        'Damp patches, bubbling paint, or a musty smell can indicate a leak behind a surface. The source must be found before cosmetic repair.',
        'Les taches humides, la peinture cloquée ou une odeur de moisi peuvent indiquer une fuite derrière une surface. La source doit être trouvée avant toute réparation esthétique.',
        'قد تشير بقع الرطوبة أو تقشر الطلاء أو رائحة العفن إلى تسرب خلف السطح. يجب إيجاد المصدر قبل الإصلاح التجميلي.',
      ),
      confidence: 0.3,
      verification: L(
        'Observe whether the damp area grows after rain or use. Do not open a ceiling or wall containing wiring without isolating the circuit.',
        'Observez si la zone humide s’agrandit après la pluie ou l’utilisation. N’ouvrez pas un plafond ou un mur contenant des câbles sans couper le circuit.',
        'لاحظ ما إذا كانت منطقة الرطوبة تتوسع بعد المطر أو الاستخدام. لا تفتح سقفًا أو جدارًا يحتوي أسلاكًا دون فصل الدائرة.',
      ),
    },
    {
      title: L('Structural movement', 'Mouvement structurel', 'حركة إنشائية'),
      explanation: L(
        'A widening crack, sagging surface, or displaced lintel needs assessment by a structural professional. Photos cannot establish structural safety.',
        'Une fissure qui s’élargit, une surface affaissée ou un linteau déplacé nécessitent l’avis d’un professionnel en structure. Les photos ne peuvent pas établir la sécurité structurelle.',
        'يتطلب التشقق المتوسع أو السطح المترهل أو العتبة المنزاحة تقييمًا من مهني إنشائي. لا يمكن للصور إثبات السلامة الإنشائية.',
      ),
      confidence: 0.2,
      verification: L(
        'Do not fill, drill, or load the area. Keep people away and arrange an inspection if movement is recent or worsening.',
        'Ne remplissez, ne percez ou ne chargez pas la zone. Éloignez les personnes et faites inspecter si le mouvement est récent ou s’aggrave.',
        'لا تملأ أو تحفر أو تحمّل المنطقة. أبعد الأشخاص واتصل لفحص إذا كانت الحركة حديثة أو تزداد.',
      ),
    },
  ],
  electronics: [
    {
      title: L(
        'Cable, port, or power-adapter fault',
        'Câble, port ou adaptateur d’alimentation défectueux',
        'كابل أو منفذ أو محول طاقة معيب',
      ),
      explanation: L(
        'Intermittent charging or connection problems often come from a cable, port debris, or adapter before the device itself.',
        'Les problèmes de charge ou de connexion intermittents viennent souvent d’un câble, de poussière dans le port ou de l’adaptateur avant l’appareil.',
        'غالبًا ما تأتي مشاكل الشحن أو الاتصال المتقطعة من كابل أو أوساخ في المنفذ أو محول قبل الجهاز نفسه.',
      ),
      confidence: 0.46,
      verification: L(
        'Try a known-good cable and adapter, inspect the port without inserting metal tools, and check for swelling or heat. Stop if the battery is swollen or hot.',
        'Essayez un câble et un adaptateur fiables, inspectez le port sans outil métallique et vérifiez gonflement ou chaleur. Arrêtez si la batterie est gonflée ou chaude.',
        'جرّب كابلًا ومحولًا سليمين وافحص المنفذ دون إدخال أدوات معدنية وتحقق من الانتفاخ أو الحرارة. توقف إذا كانت البطارية منتفخة أو ساخنة.',
      ),
    },
    {
      title: L(
        'Software or configuration issue',
        'Problème logiciel ou de configuration',
        'مشكلة برمجية أو إعدادات',
      ),
      explanation: L(
        'A recent update, full storage, or incorrect setting can mimic a hardware fault. Back up important data before troubleshooting.',
        'Une mise à jour récente, un stockage plein ou un réglage incorrect peuvent imiter une panne matérielle. Sauvegardez les données importantes avant de diagnostiquer.',
        'قد يحاكي تحديث حديث أو امتلاء التخزين أو إعداد خاطئ عطلًا في العتاد. احتفظ بنسخة احتياطية من البيانات المهمة قبل استكشاف المشكلة.',
      ),
      confidence: 0.32,
      verification: L(
        'Restart the device and check storage. Do not perform a factory reset until you have a backup and understand the data loss.',
        'Redémarrez l’appareil et vérifiez le stockage. Ne faites pas de réinitialisation avant d’avoir une sauvegarde et compris la perte de données.',
        'أعد تشغيل الجهاز وتحقق من التخزين. لا تقم بإعادة ضبط المصنع قبل أخذ نسخة احتياطية وفهم فقدان البيانات.',
      ),
    },
    {
      title: L(
        'Battery or internal component degradation',
        'Batterie ou composant interne dégradé',
        'تدهور البطارية أو مكون داخلي',
      ),
      explanation: L(
        'Reduced runtime, unexpected shutdowns, or heat can indicate battery ageing. Internal repair is professional-only on most modern devices.',
        'Une autonomie réduite, des arrêts inattendus ou de la chaleur peuvent indiquer un vieillissement de la batterie. La réparation interne est réservée aux professionnels sur la plupart des appareils modernes.',
        'قد يشير قصر مدة التشغيل أو الإيقاف غير المتوقع أو الحرارة إلى تقدم عمر البطارية. الإصلاح الداخلي للمهنيين في معظم الأجهزة الحديثة.',
      ),
      confidence: 0.26,
      verification: L(
        'Check battery health in settings. Do not puncture, bend, or charge a swollen battery. Keep it away from flammable materials and seek professional service.',
        'Vérifiez l’état de la batterie dans les réglages. Ne percez, pliez ou chargez pas une batterie gonflée. Éloignez-la des matières inflammables et faites appel à un professionnel.',
        'تحقق من صحة البطارية في الإعدادات. لا تثقب أو تثنِ أو تشحن بطارية منتفخة. أبعدها عن المواد القابلة للاشتعال واستعن بخدمة مهنية.',
      ),
    },
  ],
  other: [
    {
      title: L(
        'Wear or loose external part',
        'Usure ou pièce externe desserrée',
        'تآكل أو جزء خارجي مرتخي',
      ),
      explanation: L(
        'Without a specific item type, the most likely starting point is visible wear, a loose external part, or a simple blockage.',
        'Sans type d’objet précis, le point de départ le plus probable est une usure visible, une pièce externe desserrée ou un simple bouchon.',
        'دون نوع محدد للعنصر، فإن النقطة الأكثر ترجيحًا هي التآكل الظاهر أو جزء خارجي مرتخي أو انسداد بسيط.',
      ),
      confidence: 0.28,
      verification: L(
        'Inspect only external, user-accessible parts while the item is switched off and stable. Do not open sealed enclosures.',
        'Inspectez uniquement les parties externes accessibles, objet éteint et stable. N’ouvrez pas les boîtiers scellés.',
        'افحص فقط الأجزاء الخارجية المتاحة مع إطفاء الجهاز وتثبيته. لا تفتح الحاويات المحكمة.',
      ),
    },
    {
      title: L(
        'Incorrect use or maintenance',
        'Utilisation ou entretien incorrect',
        'استخدام أو صيانة غير صحيحة',
      ),
      explanation: L(
        'A blocked vent, wrong setting, or missed user maintenance can cause symptoms that look like a failure.',
        'Une grille bouchée, un mauvais réglage ou un entretien utilisateur manqué peuvent provoquer des symptômes ressemblant à une panne.',
        'قد تؤدي فتحة مسدودة أو إعداد خاطئ أو صيانة مستخدم فائتة إلى أعراض تشبه العطل.',
      ),
      confidence: 0.24,
      verification: L(
        'Check the user manual for safe, user-serviceable maintenance. Do not force parts or bypass warnings.',
        'Consultez le manuel pour l’entretien utilisateur sûr. Ne forcez pas les pièces et ne contournez pas les avertissements.',
        'راجع دليل المستخدم للصيانة الآمنة المتاحة. لا تفرض الأجزاء ولا تتجاوز التحذيرات.',
      ),
    },
    {
      title: L(
        'Fault requiring on-site diagnosis',
        'Panne nécessitant un diagnostic sur place',
        'عطل يتطلب تشخيصًا في الموقع',
      ),
      explanation: L(
        'If the symptom persists after safe external checks, a professional may need to measure, test, or inspect concealed parts.',
        'Si le symptôme persiste après des contrôles externes sûrs, un professionnel peut devoir mesurer, tester ou inspecter des parties cachées.',
        'إذا استمر العرض بعد الفحوصات الخارجية الآمنة، فقد يحتاج المهني إلى القياس أو الاختبار أو فحص الأجزاء المخفية.',
      ),
      confidence: 0.2,
      verification: L(
        'Prepare a clear description of when the problem occurs, sounds, smells, error codes, and anything already checked.',
        'Préparez une description claire du moment où le problème survient, des bruits, odeurs, codes d’erreur et contrôles déjà effectués.',
        'جهّز وصفًا واضحًا لوقت حدوث المشكلة والأصوات والروائح ورموز الخطأ وما تم فحصه.',
      ),
    },
  ],
};

function chooseType(input: DemoAnalysisInput): string {
  const haystack = `${input.description} ${input.brand ?? ''} ${input.model ?? ''}`;
  const match = TYPE_HINTS.find((hint) => hint.pattern.test(haystack));
  return pick(match?.name ?? CATEGORY_NAMES[input.category], input.locale);
}

function safeCheckSteps(input: DemoAnalysisInput): DiagnosisAnalysis['next_steps'] {
  const steps: DiagnosisAnalysis['next_steps'] = [];
  const add = (id: string, title: Localized, description: Localized) => {
    steps.push({
      id,
      title: pick(title, input.locale),
      description: pick(description, input.locale),
      type: 'check',
      safe: true,
    });
  };

  if (input.category === 'appliance' || input.category === 'electronics') {
    add(
      'check-power',
      L(
        'Isolate power before inspecting',
        'Couper l’alimentation avant inspection',
        'افصل الكهرباء قبل الفحص',
      ),
      L(
        'Switch off and unplug the item, or use the labelled circuit breaker. Do not touch a damaged cable or wet plug.',
        'Éteignez et débranchez l’objet, ou utilisez le disjoncteur étiqueté. Ne touchez pas un câble endommagé ou une fiche mouillée.',
        'أطفئ الجهاز وافصله، أو استخدم القاطع المحدد. لا تلمس كابلًا تالفًا أو قابسًا مبللًا.',
      ),
    );
  }
  if (input.category === 'plumbing') {
    add(
      'check-water',
      L('Find the first drop', 'Localiser la première goutte', 'حدد أول قطرة'),
      L(
        'Dry the area and place a container underneath. Observe where water first appears. Do not dismantle pipes under pressure.',
        'Séchez la zone et placez un récipient dessous. Observez où l’eau apparaît. Ne démontez pas de tuyau sous pression.',
        'جفف المنطقة وضع وعاءً تحتها. راقب أين يظهر الماء أولًا. لا تفك أنابيب تحت الضغط.',
      ),
    );
  }
  if (input.category === 'heating_cooling') {
    add(
      'check-filter',
      L(
        'Check only the user-accessible filter',
        'Vérifier uniquement le filtre accessible',
        'افحص فقط الفلتر المتاح',
      ),
      L(
        'With the system off, inspect the filter and vents described in the manual. Do not open gas or refrigerant sections.',
        'Système éteint, inspectez le filtre et les grilles décrits dans le manuel. N’ouvrez pas les parties gaz ou réfrigérant.',
        'أوقف النظام وافحص الفلتر والفتحات المذكورة في الدليل. لا تفتح أقسام الغاز أو التبريد.',
      ),
    );
  }
  add(
    'check-pattern',
    L('Record when it happens', 'Noter quand cela se produit', 'سجّل وقت حدوث المشكلة'),
    L(
      'Note whether the problem is constant or intermittent, what changed recently, and any sounds, smells, or error codes. Stop if anything becomes hot, smokes, sparks, or leaks near electricity.',
      'Notez si le problème est constant ou intermittent, ce qui a changé récemment, ainsi que les bruits, odeurs ou codes. Arrêtez si quelque chose chauffe, fume, fait des étincelles ou fuit près de l’électricité.',
      'لاحظ ما إذا كانت المشكلة دائمة أو متقطعة وما تغير مؤخرًا وأي أصوات أو روائح أو رموز خطأ. توقف إذا أصبح أي شيء ساخنًا أو دخانيًا أو يشرر أو يسرب قرب الكهرباء.',
    ),
  );
  if (input.errorCode) {
    add(
      'check-error-code',
      L(
        'Check the manufacturer error code',
        'Vérifier le code d’erreur du fabricant',
        'تحقق من رمز خطأ المصنع',
      ),
      L(
        `The code “${input.errorCode.slice(0, 40)}” may have a model-specific meaning. Use the official manual or support channel; do not bypass a safety lockout.`,
        `Le code « ${input.errorCode.slice(0, 40)} » peut avoir un sens spécifique au modèle. Utilisez le manuel officiel ou le support ; ne contournez pas un verrouillage de sécurité.`,
        `قد يكون للرمز «${input.errorCode.slice(0, 40)}» معنى خاص بالطراز. استخدم الدليل الرسمي أو الدعم؛ لا تتجاوز قفل أمان.`,
      ),
    );
  }
  add(
    'check-manual',
    L('Use the official manual', 'Utiliser le manuel officiel', 'استخدم الدليل الرسمي'),
    L(
      'Model-specific steps and safety limits belong in the manufacturer documentation. If the manual is unavailable, ask the manufacturer rather than guessing.',
      'Les étapes et limites de sécurité spécifiques au modèle figurent dans la documentation du fabricant. Si le manuel est indisponible, demandez au fabricant plutôt que de deviner.',
      'الخطوات وحدود السلامة الخاصة بالطراز موجودة في وثائق المصنع. إذا لم يتوفر الدليل، اسأل المصنع بدل التخمين.',
    ),
  );

  return steps.slice(0, 6);
}

function buildRepairOption(
  template: CauseTemplate,
  locale: string,
  index: number,
): RepairOption | null {
  if (!template.repair) return null;
  const repair = template.repair;
  return {
    id: `repair-${index + 1}`,
    title: pick(repair.title, locale),
    summary: pick(repair.summary, locale),
    difficulty: repair.difficulty,
    duration_minutes: repair.duration,
    tools: repair.tools.map((tool) => pick(tool, locale)),
    materials: repair.materials.map((material) => pick(material, locale)),
    professional_only: false,
    steps: repair.steps.map((step, stepIndex) => ({
      id: `repair-${index + 1}-step-${stepIndex + 1}`,
      title: pick(step.title, locale),
      instructions: pick(step.instructions, locale),
      warning: step.warning
        ? {
            code: 'unsafe_instruction_removed' as const,
            severity: 'medium' as const,
            message: pick(step.warning, locale),
            source: 'rule' as const,
          }
        : null,
      requires_professional: false,
    })),
  };
}

export function generateDemoAnalysis(input: DemoAnalysisInput): DiagnosisAnalysis {
  const locale = langOf(input.locale);
  const templates = GENERIC_CAUSES[input.category] ?? GENERIC_CAUSES.other;
  const description = input.description.slice(0, 2000);
  const identifiedType = chooseType(input);

  const safety = assessSafety({
    text: description,
    category: input.category,
    identifiedType,
  });

  const observations: DiagnosisAnalysis['observations'] = [
    {
      id: 'obs-description',
      description:
        locale === 'fr'
          ? `Vous signalez : ${description.slice(0, 260)}`
          : locale === 'ar'
            ? `ذكرت: ${description.slice(0, 260)}`
            : `You reported: ${description.slice(0, 260)}`,
      source: 'text',
      confidence: 0.9,
    },
    {
      id: 'obs-photo',
      description:
        locale === 'fr'
          ? `${input.imageCount} photo(s) jointe(s). Le mode démo n’analyse pas les pixels de l’image.`
          : locale === 'ar'
            ? `تم إرفاق ${input.imageCount} صورة. الوضع التجريبي لا يحلل بكسلات الصورة.`
            : `${input.imageCount} photo(s) attached. Demo mode does not analyze image pixels.`,
      source: 'context',
      confidence: 1,
    },
  ];

  const possibleCauses = templates.slice(0, 3).map((cause, index) => ({
    id: `cause-${index + 1}`,
    title: pick(cause.title, input.locale),
    explanation: pick(cause.explanation, input.locale),
    confidence: cause.confidence,
    evidence: [
      locale === 'fr'
        ? 'Description fournie par l’utilisateur'
        : locale === 'ar'
          ? 'الوصف المقدم من المستخدم'
          : 'User-provided description',
    ],
    verification_needed: true,
  }));

  const nextSteps = safeCheckSteps(input);
  const repairOptions = templates
    .slice(0, 2)
    .map((template, index) => buildRepairOption(template, input.locale, index))
    .filter((option): option is RepairOption => option !== null)
    .slice(0, 2);

  const warnings: DiagnosisAnalysis['safety']['warnings'] = [
    ...safety.warnings,
    {
      code: 'demo_mode',
      severity: 'low',
      message:
        'Demo mode: this guidance is generated from your description and deterministic safety rules. No image analysis model is running.',
      source: 'rule',
    },
  ];

  const limitations: string[] = [
    locale === 'fr'
      ? 'Mode démo : les causes sont des hypothèses génériques, pas une analyse d’image par IA.'
      : locale === 'ar'
        ? 'الوضع التجريبي: الأسباب فرضيات عامة وليست تحليلًا للصورة بالذكاء الاصطناعي.'
        : 'Demo mode: these causes are generic hypotheses, not AI image analysis.',
    locale === 'fr'
      ? 'Une photo ne peut pas confirmer un défaut interne, un code de panne ou une pièce précise.'
      : locale === 'ar'
        ? 'لا يمكن للصورة تأكيد عطل داخلي أو رمز خطأ أو قطعة محددة.'
        : 'A photo cannot confirm an internal fault, error code, or exact part.',
  ];

  const base: DiagnosisAnalysis = {
    item: {
      category: input.category,
      identified_type: identifiedType,
      brand: input.brand?.slice(0, 120) || null,
      model: input.model?.slice(0, 120) || null,
    },
    summary: {
      headline:
        locale === 'fr'
          ? `Pistes initiales pour votre ${identifiedType}`
          : locale === 'ar'
            ? `فرضيات أولية لـ${identifiedType}`
            : `Initial possibilities for your ${identifiedType}`,
      plain_language:
        locale === 'fr'
          ? 'Voici des explications possibles et des vérifications sûres. Elles ne constituent pas un diagnostic confirmé. Le mode démo n’a pas analysé l’image.'
          : locale === 'ar'
            ? 'هذه تفسيرات محتملة وفحوصات آمنة. وهي ليست تشخيصًا مؤكدًا. لم يحلل الوضع التجريبي الصورة.'
            : 'Here are possible explanations and safe checks. This is not a confirmed diagnosis. Demo mode did not analyze the image.',
      confidence: 0.32,
      uncertainty: [
        locale === 'fr'
          ? 'Aucune analyse d’image n’a été effectuée en mode démo.'
          : locale === 'ar'
            ? 'لم يتم إجراء تحليل للصورة في الوضع التجريبي.'
            : 'No image analysis was performed in demo mode.',
        locale === 'fr'
          ? 'Le modèle et l’état interne de l’objet restent inconnus.'
          : locale === 'ar'
            ? 'الطراز والحالة الداخلية للجهاز ما زالا غير معروفين.'
            : 'The model and internal condition of the item remain unknown.',
      ],
    },
    observations,
    possible_causes: possibleCauses,
    safety: {
      risk_level: safety.riskLevel,
      professional_required: safety.professionalRequired,
      stop_guidance: safety.stopGuidance,
      warnings,
      escalation: safety.warnings[0]?.message ?? null,
    },
    next_steps: nextSteps,
    repairability: {
      verdict: safety.professionalRequired
        ? 'professional'
        : repairOptions.length > 0
          ? 'diy_with_caution'
          : 'unknown',
      rationale:
        locale === 'fr'
          ? 'Cette évaluation est fondée sur votre description et des règles de sécurité. Confirmez toujours avec le manuel du fabricant.'
          : locale === 'ar'
            ? 'يعتمد هذا التقييم على وصفك وقواعد السلامة. تحقق دائمًا من دليل المصنع.'
            : 'This assessment is based on your description and safety rules. Always confirm against the manufacturer manual.',
    },
    repair_options: repairOptions,
    estimate: unavailableEstimate(input.currency, ESTIMATE_REASONS.noVerifiedPricing),
    limitations,
    follow_up_questions: [
      {
        id: 'followup-start',
        question:
          locale === 'fr'
            ? 'Quand le problème a-t-il commencé et est-il constant ?'
            : locale === 'ar'
              ? 'متى بدأت المشكلة وهل هي مستمرة؟'
              : 'When did the problem start, and is it constant?',
        why:
          locale === 'fr'
            ? 'Le moment et la fréquence orientent les hypothèses.'
            : locale === 'ar'
              ? 'يساعد التوقيت والتكرار في تضييق الاحتمالات.'
              : 'Timing and frequency help narrow the possibilities.',
      },
      {
        id: 'followup-changes',
        question:
          locale === 'fr'
            ? 'Quelque chose a-t-il changé juste avant le problème (déménagement, réparation, surtension) ?'
            : locale === 'ar'
              ? 'هل تغير شيء قبل ظهور المشكلة مباشرة (نقل، إصلاح، ارتفاع جهد)؟'
              : 'Did anything change just before the problem (a move, repair, power surge)?',
        why:
          locale === 'fr'
            ? 'Un événement récent peut expliquer une panne soudaine.'
            : locale === 'ar'
              ? 'قد يفسر حدث حديث عطلًا مفاجئًا.'
              : 'A recent event can explain a sudden fault.',
      },
    ],
    provider: {
      name: 'SNAPFIX Demo Analyzer',
      model: 'deterministic-rules-v1',
      mode: 'demo',
      generated_at: new Date().toISOString(),
      schema_version: DIAGNOSIS_SCHEMA_VERSION,
      prompt_version: DIAGNOSIS_PROMPT_VERSION,
    },
  };

  const withSafety = applySafetyPolicy(base, {
    text: `${description} ${input.brand ?? ''} ${input.model ?? ''} ${input.errorCode ?? ''}`,
    locale: input.locale,
    category: input.category,
  });

  return analysisSchema.parse(withSafety);
}
