/* eslint-disable @typescript-eslint/ban-types */

import { POIDispute, POIDisputeIdentifier, POIDisputeCreationAttributes } from '../models'
import { IndexerManagementResolverContext } from '../client'
import { validateNetworkIdentifier } from '../../parsers'
import { Op } from 'sequelize'
import groupBy from 'lodash.groupby'

export default {
  dispute: async (
    { identifier }: { identifier: POIDisputeIdentifier },
    { models }: IndexerManagementResolverContext,
  ): Promise<object | null> => {
    const dispute = await models.POIDispute.findOne({
      where: { ...identifier },
    })
    return dispute?.toGraphQL() || dispute
  },

  disputes: async (
    {
      status,
      minClosedEpoch,
      protocolNetwork: uncheckedProtocolNetwork,
    }: { status: string; minClosedEpoch: number; protocolNetwork: string },
    { models }: IndexerManagementResolverContext,
  ): Promise<object | null> => {
    // Sanitize protocol network identifier
    const protocolNetwork = validateNetworkIdentifier(uncheckedProtocolNetwork)

    const disputes = await models.POIDispute.findAll({
      where: {
        [Op.and]: [
          { status },
          {
            closedEpoch: {
              [Op.gte]: minClosedEpoch,
            },
          },
          { protocolNetwork },
        ],
      },
      order: [['allocationAmount', 'DESC']],
    })
    return disputes.map((dispute) => dispute.toGraphQL())
  },

  storeDisputes: async (
    { disputes }: { disputes: POIDisputeCreationAttributes[] },
    { models }: IndexerManagementResolverContext,
  ): Promise<object | null> => {
    // Sanitize protocol network identifiers
    for (const dispute of disputes) {
      if (!dispute.protocolNetwork) {
        throw new Error(`Dispute is missing the attribute 'protocolNetwork'`)
      }
      dispute.protocolNetwork = validateNetworkIdentifier(dispute.protocolNetwork)
    }

    const createdDisputes = await models.POIDispute.bulkCreate(disputes, {
      returning: true,
      validate: true,
      updateOnDuplicate: [
        'closedEpochReferenceProof',
        'previousEpochReferenceProof',
        'status',
      ],
    })
    return createdDisputes.map((dispute: POIDispute) => dispute.toGraphQL())
  },

  deleteDisputes: async (
    { identifiers }: { identifiers: POIDisputeIdentifier[] },
    { models }: IndexerManagementResolverContext,
  ): Promise<number> => {
    let totalNumDeleted = 0

    // Sanitize protocol network identifiers
    for (const identifier of identifiers) {
      if (!identifier.protocolNetwork) {
        throw new Error(`Dispute is missing the attribute 'protocolNetwork'`)
      }
      identifier.protocolNetwork = validateNetworkIdentifier(identifier.protocolNetwork)
    }

    // Batch by protocolNetwork
    const batches = groupBy(identifiers, (x: POIDisputeIdentifier) => x.protocolNetwork)

    for (const protocolNetwork in batches) {
      const batch = batches[protocolNetwork]
      const numDeleted = await models.POIDispute.destroy({
        where: {
          allocationID: batch.map((x) => x.allocationID),
        },
        force: true,
      })
      totalNumDeleted += numDeleted
    }
    return totalNumDeleted
  },
}
