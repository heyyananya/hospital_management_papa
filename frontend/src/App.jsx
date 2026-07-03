import { Routes, Route, Navigate } from 'react-router-dom';

import MainLayout from './layouts/MainLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PatientSearch from './pages/PatientSearch.jsx';
import PatientRegister from './pages/PatientRegister.jsx';
import PatientHistory from './pages/PatientHistory.jsx';
import MOQueue from './pages/MOQueue.jsx';
import MOVisit from './pages/MOVisit.jsx';
import MOStats from './pages/MOStats.jsx';
import DoctorQueue from './pages/DoctorQueue.jsx';
import DoctorVisit from './pages/DoctorVisit.jsx';
import Visits from './pages/Visits.jsx';
import VisitBilling from './pages/VisitBilling.jsx';
import ServicesMaster from './pages/ServicesMaster.jsx';
import AutoBills from './pages/AutoBills.jsx';
import FinalBills from './pages/FinalBills.jsx';
import BillDetail from './pages/BillDetail.jsx';
import Masters from './pages/Masters.jsx';
import Reminders from './pages/Reminders.jsx';
import ThreeCRegister from './pages/ThreeCRegister.jsx';
import ThreeCRegisterIpd from './pages/ThreeCRegisterIpd.jsx';
import DiseaseTemplates from './pages/DiseaseTemplates.jsx';
import WardsAndBeds from './pages/WardsAndBeds.jsx';
import PendingAdmissions from './pages/PendingAdmissions.jsx';
import IpdPatients from './pages/IpdPatients.jsx';
import DischargedPatients from './pages/DischargedPatients.jsx';
import IndoorSheet from './pages/IndoorSheet.jsx';
import IndoorSheetRecent from './pages/IndoorSheetRecent.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />

        <Route path="patients/search" element={<PatientSearch />} />
        <Route
          path="patients/new"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER']}>
              <PatientRegister />
            </ProtectedRoute>
          }
        />
        <Route path="patients/:id/history" element={<PatientHistory />} />

        <Route
          path="mo"
          element={
            <ProtectedRoute roles={['ADMIN', 'MEDICAL_OFFICER']}>
              <MOQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="mo/visit/:visitId"
          element={
            <ProtectedRoute roles={['ADMIN', 'MEDICAL_OFFICER']}>
              <MOVisit />
            </ProtectedRoute>
          }
        />
        <Route
          path="mo/stats"
          element={
            <ProtectedRoute roles={['ADMIN', 'MEDICAL_OFFICER']}>
              <MOStats />
            </ProtectedRoute>
          }
        />

        <Route
          path="doctor"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <DoctorQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="doctor/visit/:visitId"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <DoctorVisit />
            </ProtectedRoute>
          }
        />

        <Route path="visits" element={<Visits />} />
        <Route
          path="visits/:visitId/billing"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER']}>
              <VisitBilling />
            </ProtectedRoute>
          }
        />

        <Route
          path="masters"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Masters />
            </ProtectedRoute>
          }
        />
        <Route
          path="services"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <ServicesMaster />
            </ProtectedRoute>
          }
        />
        <Route
          path="bills/auto"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <AutoBills />
            </ProtectedRoute>
          }
        />
        <Route
          path="bills/final"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <FinalBills />
            </ProtectedRoute>
          }
        />
        <Route
          path="bills/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <BillDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="reminders"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Reminders />
            </ProtectedRoute>
          }
        />
        <Route
          path="disease-templates"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <DiseaseTemplates />
            </ProtectedRoute>
          }
        />
        <Route
          path="wards-beds"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <WardsAndBeds />
            </ProtectedRoute>
          }
        />
        <Route
          path="ipd/pending"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <PendingAdmissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="ipd/patients"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <IpdPatients />
            </ProtectedRoute>
          }
        />
        <Route
          path="ipd/discharged"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <DischargedPatients />
            </ProtectedRoute>
          }
        />
        <Route
          path="ipd/admissions/:admissionId/indoor-sheet"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <IndoorSheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="ipd/indoor-sheet/recent"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <IndoorSheetRecent />
            </ProtectedRoute>
          }
        />
        <Route
          path="registers/3c"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <ThreeCRegister />
            </ProtectedRoute>
          }
        />
        <Route
          path="registers/3c-ipd"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <ThreeCRegisterIpd />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute roles={['ADMIN', 'RECEPTIONIST']}>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
