import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { authService } from '../services/auth.js';
import { db } from '../config/firebase.js';

describe('PIN Change Request Flow', () => {
  let dbCollectionMock: any;
  let runTransactionMock: any;
  let dummyDoc: any;

  beforeEach(() => {
    // Reset mocks before each test
    dummyDoc = {
      get: mock(() => Promise.resolve({
        exists: true,
        data: () => ({
          uid: 'RAD5000001',
          email: 'user@example.com',
          fullName: 'Test User',
          pin: '$2a$12$oldhashedpin',
          pinSetup: true,
          expoPushToken: 'ExponentPushToken[xxxx]',
        }),
      })),
      set: mock(() => Promise.resolve()),
      update: mock(() => Promise.resolve()),
    };

    dbCollectionMock = mock((collectionName: string) => {
      return {
        doc: mock((docId?: string) => dummyDoc),
        where: mock(() => ({
          where: mock(() => ({
            limit: mock(() => ({
              get: mock(() => Promise.resolve({
                empty: true,
                docs: [],
              })),
            })),
          })),
          orderBy: mock(() => ({
            limit: mock(() => ({
              get: mock(() => Promise.resolve({
                empty: true,
                docs: [],
              })),
            })),
          })),
        })),
      };
    });

    runTransactionMock = mock((fn: any) => fn({
      update: mock(() => {}),
    }));

    // Override firebase db properties
    (db as any).collection = dbCollectionMock;
    (db as any).runTransaction = runTransactionMock;
  });

  describe('requestPinChange', () => {
    it('should throw an error if PIN is not 4 digits', async () => {
      expect(authService.requestPinChange('user123', '123')).rejects.toThrow('PIN must be exactly 4 digits');
      expect(authService.requestPinChange('user123', '12345')).rejects.toThrow('PIN must be exactly 4 digits');
      expect(authService.requestPinChange('user123', 'abcd')).rejects.toThrow('PIN must be exactly 4 digits');
    });

    it('should successfully create a new PIN change request when 4 digits', async () => {
      const setMock = mock(() => Promise.resolve());
      const getMock = mock(() => Promise.resolve({
        exists: true,
        data: () => ({
          uid: 'RAD5000001',
          email: 'user@example.com',
          fullName: 'Test User',
        }),
      }));

      (db as any).collection = mock((collectionName: string) => {
        return {
          doc: () => ({
            get: getMock,
            set: setMock,
            update: mock(() => Promise.resolve()),
          }),
          where: () => ({
            where: () => ({
              limit: () => ({
                get: () => Promise.resolve({ empty: true, docs: [] }),
              }),
            }),
          }),
        };
      });

      await authService.requestPinChange('user123', '4321');
      expect(setMock).toHaveBeenCalled();
    });
  });

  describe('approvePinChangeRequest', () => {
    it('should approve request when entered PIN matches preferred PIN', async () => {
      const { hashPin } = await import('../utils/pin-hash.js');
      const hashedPreferred = await hashPin('9876');

      const updateMock = mock(() => Promise.resolve());
      const getRequestMock = mock(() => Promise.resolve({
        exists: true,
        data: () => ({
          userId: 'user123',
          preferredPin: hashedPreferred,
          status: 'PENDING',
        }),
      }));

      (db as any).collection = mock((collectionName: string) => {
        if (collectionName === 'pin_change_requests') {
          return {
            doc: () => ({
              get: getRequestMock,
              update: updateMock,
            }),
          };
        }
        // Fallback for standard collections like 'users', 'user_notifications'
        return {
          doc: () => dummyDoc,
        };
      });

      const transactionUpdateMock = mock(() => {});
      (db as any).runTransaction = mock((fn: any) => fn({
        update: transactionUpdateMock,
      }));

      const result = await authService.approvePinChangeRequest('req123', 'admin123', '9876');
      expect(result.userId).toBe('user123');
      expect(transactionUpdateMock).toHaveBeenCalled();
    });

    it('should throw an error when entered PIN does not match', async () => {
      const { hashPin } = await import('../utils/pin-hash.js');
      const hashedPreferred = await hashPin('9876');

      const getRequestMock = mock(() => Promise.resolve({
        exists: true,
        data: () => ({
          userId: 'user123',
          preferredPin: hashedPreferred,
          status: 'PENDING',
        }),
      }));

      (db as any).collection = mock((collectionName: string) => {
        if (collectionName === 'pin_change_requests') {
          return {
            doc: () => ({
              get: getRequestMock,
            }),
          };
        }
        return {
          doc: () => dummyDoc,
        };
      });

      expect(authService.approvePinChangeRequest('req123', 'admin123', '1111'))
        .rejects.toThrow("The entered PIN does not match the user's preferred PIN");
    });
  });

  describe('rejectPinChangeRequest', () => {
    it('should mark request as rejected', async () => {
      const updateMock = mock(() => Promise.resolve());
      const getRequestMock = mock(() => Promise.resolve({
        exists: true,
        data: () => ({
          userId: 'user123',
          status: 'PENDING',
        }),
      }));

      (db as any).collection = mock((collectionName: string) => {
        if (collectionName === 'pin_change_requests') {
          return {
            doc: () => ({
              get: getRequestMock,
              update: updateMock,
            }),
          };
        }
        return {
          doc: () => dummyDoc,
        };
      });

      const result = await authService.rejectPinChangeRequest('req123', 'admin123', 'Wrong user details');
      expect(result.userId).toBe('user123');
      expect(updateMock).toHaveBeenCalled();
    });
  });
});
