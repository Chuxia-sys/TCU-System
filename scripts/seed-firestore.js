// Standalone Firestore seeder using REST API
// Bypasses gRPC issues in sandbox environments

const https = require('https');

const FIREBASE_API_KEY = 'AIzaSyBjw0HlEGRLJ3EoFzhIkve-pFm__-qNM0Q';
const PROJECT_ID = 'for-commission';
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper: Make HTTP request
function makeRequest(url, method, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(result)}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          } else {
            resolve(body);
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Get Firebase Auth ID token
async function getAuthToken() {
  try {
    const result = await makeRequest(
      `${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`,
      'POST',
      {
        email: 'fepc-admin@for-commission.firebaseapp.com',
        password: 'fepc-admin-2024',
        returnSecureToken: true,
      }
    );
    console.log('✅ Authenticated with Firebase');
    return result.idToken;
  } catch (error) {
    console.log('⚠️  Auth failed:', error.message);
    console.log('Continuing without auth (open rules)...');
    return null;
  }
}

// Firestore REST API helpers
function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(v => toFirestoreValue(v)) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

// Create or update a Firestore document via REST API
async function setDocument(collection, docId, data, authToken) {
  const fields = toFirestoreFields(data);
  const url = `${FIRESTORE_URL}/${collection}/${docId}`;
  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    // PATCH to update or create
    const maskParams = Object.keys(data).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    await makeRequest(`${url}?${maskParams}`, 'PATCH', { fields }, headers);
  } catch (e) {
    // Fallback: try POST to create
    try {
      await makeRequest(`${FIRESTORE_URL}/${collection}?documentId=${docId}`, 'POST', { fields }, headers);
    } catch (e2) {
      console.error(`  ❌ Failed ${collection}/${docId}:`, e2.message?.substring(0, 100));
      return;
    }
  }
}

// Query a collection by field value
async function queryByField(collection, field, value, authToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const query = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: value },
        },
      },
      limit: 1,
    },
  };

  try {
    const results = await makeRequest(url, 'POST', query, headers);
    if (Array.isArray(results) && results.length > 0 && results[0].document) {
      return results[0].document;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🔑 Authenticating with Firebase...');
  const authToken = await getAuthToken();

  // Check if already seeded
  console.log('🔍 Checking if database is already seeded...');
  const existingAdmin = await queryByField('users', 'email', 'admin@fepc.edu.ph', authToken);
  if (existingAdmin) {
    console.log('✅ Database already seeded! Admin user found.');
    return;
  }

  console.log('🌱 Seeding database via REST API...');
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash('password123', 10);
  const now = new Date().toISOString();

  // Create departments
  console.log('📁 Creating departments...');
  const departments = [
    { id: 'dept-cs', name: 'Computer Science', code: 'CS', college: 'College of Engineering', createdAt: now, updatedAt: now },
    { id: 'dept-ee', name: 'Electronics Engineering', code: 'EE', college: 'College of Engineering', createdAt: now, updatedAt: now },
    { id: 'dept-me', name: 'Mechanical Engineering', code: 'ME', college: 'College of Engineering', createdAt: now, updatedAt: now },
    { id: 'dept-ce', name: 'Civil Engineering', code: 'CE', college: 'College of Engineering', createdAt: now, updatedAt: now },
    { id: 'dept-ba', name: 'Business Administration', code: 'BA', college: 'College of Business', createdAt: now, updatedAt: now },
  ];
  for (const dept of departments) {
    const { id, ...data } = dept;
    await setDocument('departments', id, data, authToken);
    console.log(`  ✅ ${dept.name}`);
  }

  // Create users
  console.log('👥 Creating users...');
  const users = [
    { id: 'user-admin', uid: 'admin-001', name: 'System Administrator', email: 'admin@fepc.edu.ph', password: hashedPassword, role: 'admin', departmentId: null, maxUnits: 24, specialization: '[]', contractType: 'full-time', phone: null, image: null, createdAt: now, updatedAt: now },
    { id: 'user-head-cs', uid: 'head-cs-001', name: 'Dr. Maria Santos', email: 'head.cs@fepc.edu.ph', password: hashedPassword, role: 'department_head', departmentId: 'dept-cs', maxUnits: 12, specialization: '["Computer Science", "Software Engineering"]', contractType: 'full-time', phone: null, image: null, createdAt: now, updatedAt: now },
    { id: 'user-faculty1', uid: 'faculty-001', name: 'Prof. Juan Cruz', email: 'faculty1@fepc.edu.ph', password: hashedPassword, role: 'faculty', departmentId: 'dept-cs', maxUnits: 24, specialization: '["Programming", "Database Systems"]', contractType: 'full-time', phone: null, image: null, createdAt: now, updatedAt: now },
    { id: 'user-faculty2', uid: 'faculty-002', name: 'Prof. Ana Reyes', email: 'faculty2@fepc.edu.ph', password: hashedPassword, role: 'faculty', departmentId: 'dept-cs', maxUnits: 24, specialization: '["Web Development", "Mobile Apps"]', contractType: 'full-time', phone: null, image: null, createdAt: now, updatedAt: now },
    { id: 'user-faculty3', uid: 'faculty-003', name: 'Prof. Carlos Mendoza', email: 'faculty3@fepc.edu.ph', password: hashedPassword, role: 'faculty', departmentId: 'dept-cs', maxUnits: 18, specialization: '["Networking", "Security"]', contractType: 'part-time', phone: null, image: null, createdAt: now, updatedAt: now },
  ];
  for (const user of users) {
    const { id, ...data } = user;
    await setDocument('users', id, data, authToken);
    console.log(`  ✅ ${user.email}`);
  }

  // Create faculty preferences
  console.log('⚙️  Creating faculty preferences...');
  const facultyIds = ['user-head-cs', 'user-faculty1', 'user-faculty2', 'user-faculty3'];
  const prefDays = '["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]';
  for (const fId of facultyIds) {
    const prefId = 'pref-' + fId;
    await setDocument('facultyPreferences', prefId, {
      facultyId: fId,
      preferredDays: prefDays,
      preferredTimeStart: '08:00',
      preferredTimeEnd: '17:00',
      preferredSubjects: '[]',
      unavailableDays: '[]',
      notes: '',
      createdAt: now,
      updatedAt: now,
    }, authToken);
    console.log(`  ✅ Preference for ${fId}`);
  }

  // Create rooms
  console.log('🏫 Creating rooms...');
  const rooms = [
    { id: 'room-101', roomName: 'Room 101', roomCode: 'R101', capacity: 40, equipment: '["Projector", "Whiteboard"]', building: 'Main Building', floor: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-102', roomName: 'Room 102', roomCode: 'R102', capacity: 35, equipment: '["Projector", "Whiteboard"]', building: 'Main Building', floor: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-201', roomName: 'Room 201', roomCode: 'R201', capacity: 45, equipment: '["Projector", "Whiteboard", "Audio System"]', building: 'Main Building', floor: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-lab-a', roomName: 'Computer Lab A', roomCode: 'LAB-A', capacity: 30, equipment: '["Computers", "Projector", "Air Conditioning"]', building: 'IT Building', floor: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-lab-b', roomName: 'Computer Lab B', roomCode: 'LAB-B', capacity: 30, equipment: '["Computers", "Projector", "Air Conditioning"]', building: 'IT Building', floor: 2, isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const room of rooms) {
    const { id, ...data } = room;
    await setDocument('rooms', id, data, authToken);
    console.log(`  ✅ ${room.roomName}`);
  }

  // Create subjects
  console.log('📚 Creating subjects...');
  const subjects = [
    { id: 'subj-cs101', subjectCode: 'CS101', subjectName: 'Introduction to Programming', description: 'Fundamentals of programming using Python', units: 3, departmentId: 'dept-cs', requiredSpecialization: '[]', isActive: true, createdAt: now, updatedAt: now },
    { id: 'subj-cs102', subjectCode: 'CS102', subjectName: 'Data Structures and Algorithms', description: 'Study of data structures and algorithm design', units: 3, departmentId: 'dept-cs', requiredSpecialization: '["Computer Science"]', isActive: true, createdAt: now, updatedAt: now },
    { id: 'subj-cs103', subjectCode: 'CS103', subjectName: 'Database Management Systems', description: 'Relational database design and SQL', units: 3, departmentId: 'dept-cs', requiredSpecialization: '["Database Systems"]', isActive: true, createdAt: now, updatedAt: now },
    { id: 'subj-cs104', subjectCode: 'CS104', subjectName: 'Web Development', description: 'HTML, CSS, JavaScript and modern frameworks', units: 3, departmentId: 'dept-cs', requiredSpecialization: '["Web Development"]', isActive: true, createdAt: now, updatedAt: now },
    { id: 'subj-cs105', subjectCode: 'CS105', subjectName: 'Object-Oriented Programming', description: 'OOP concepts using Java', units: 3, departmentId: 'dept-cs', requiredSpecialization: '["Programming"]', isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const subj of subjects) {
    const { id, ...data } = subj;
    await setDocument('subjects', id, data, authToken);
    console.log(`  ✅ ${subj.subjectCode}`);
  }

  // Create sections
  console.log('📋 Creating sections...');
  const sections = [
    { id: 'sec-1csa', sectionName: '1CS-A', sectionCode: '1CS-A', yearLevel: 1, departmentId: 'dept-cs', studentCount: 35, isActive: true, createdAt: now, updatedAt: now },
    { id: 'sec-1csb', sectionName: '1CS-B', sectionCode: '1CS-B', yearLevel: 1, departmentId: 'dept-cs', studentCount: 32, isActive: true, createdAt: now, updatedAt: now },
    { id: 'sec-2csa', sectionName: '2CS-A', sectionCode: '2CS-A', yearLevel: 2, departmentId: 'dept-cs', studentCount: 30, isActive: true, createdAt: now, updatedAt: now },
    { id: 'sec-2csb', sectionName: '2CS-B', sectionCode: '2CS-B', yearLevel: 2, departmentId: 'dept-cs', studentCount: 28, isActive: true, createdAt: now, updatedAt: now },
    { id: 'sec-3csa', sectionName: '3CS-A', sectionCode: '3CS-A', yearLevel: 3, departmentId: 'dept-cs', studentCount: 25, isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const sec of sections) {
    const { id, ...data } = sec;
    await setDocument('sections', id, data, authToken);
    console.log(`  ✅ ${sec.sectionName}`);
  }

  console.log('\n🎉 Database seed completed successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('  Admin:      admin@fepc.edu.ph / password123');
  console.log('  Dept Head:  head.cs@fepc.edu.ph / password123');
  console.log('  Faculty:    faculty1@fepc.edu.ph / password123');
}

main().catch(e => { console.error('❌ FATAL:', e.message); process.exit(1); });
